/** @module Pure assembly of one goal's console view and its dependency graph from a read-model snapshot. */

import type {
  ConsoleDecision,
  ConsoleGoal,
  ConsoleHandoff,
  ConsoleIntegration,
  ConsolePlan,
  ConsoleSnapshot,
  ConsoleValidation,
  ConsoleWorker
} from "./read-model.types"

export type GraphNodeKind = "task" | "worker" | "integration" | "handoff"

export interface GraphNode {
  column: number
  detail: string
  id: string
  kind: GraphNodeKind
  label: string
  row: number
  state: string
}

export interface GraphEdge {
  from: string
  to: string
}

export interface GoalView {
  decisions: ConsoleDecision[]
  edges: GraphEdge[]
  goal: ConsoleGoal
  handoffs: ConsoleHandoff[]
  integrations: ConsoleIntegration[]
  nodes: GraphNode[]
  plan: ConsolePlan | null
  plans: ConsolePlan[]
  /** Plan task key per worker, when the worker came from the launched plan. */
  taskKeys: Record<string, string>
  validations: ConsoleValidation[]
  workers: ConsoleWorker[]
}

const byTime =
  <T>(time: (item: T) => string) =>
  (left: T, right: T) =>
    time(left).localeCompare(time(right))

/** Column = longest dependency path to the node, so every edge points left to right. */
const layer = (nodes: ReadonlyArray<{ dependsOn: readonly string[]; id: string }>): Map<string, number> => {
  const depth = new Map<string, number>()
  const ids = new Set(nodes.map((node) => node.id))
  const visit = (id: string, trail: Set<string>): number => {
    const known = depth.get(id)
    if (known !== undefined) {
      return known
    }
    if (trail.has(id)) {
      return 0
    }
    trail.add(id)
    const node = nodes.find((candidate) => candidate.id === id)
    const parents = (node?.dependsOn ?? []).filter((parent) => ids.has(parent))
    const value = parents.length === 0 ? 0 : Math.max(...parents.map((parent) => visit(parent, trail) + 1))
    depth.set(id, value)
    return value
  }
  for (const node of nodes) {
    visit(node.id, new Set())
  }
  return depth
}

/**
 * The graph a reviewer reads left to right: planned tasks (or bare workers
 * when there is no plan) in dependency columns, then the latest integration
 * attempt, then its handoff. A task that launched shows its worker's state.
 */
const graph = (
  plan: ConsolePlan | null,
  workers: readonly ConsoleWorker[],
  integration: ConsoleIntegration | undefined,
  handoff: ConsoleHandoff | undefined
): { edges: GraphEdge[]; nodes: GraphNode[] } => {
  const tasks = plan?.proposal?.tasks ?? []
  const launched = new Map((plan?.launch?.workers ?? []).map((entry) => [entry.taskKey, entry.workerId]))
  const sources =
    tasks.length > 0
      ? tasks.map((task) => {
          const worker = workers.find((candidate) => candidate.id === launched.get(task.key))
          return {
            dependsOn: task.dependsOn.map((key) => `task:${key}`),
            detail: task.scope.join(", "),
            id: `task:${task.key}`,
            kind: (worker === undefined ? "task" : "worker") as GraphNodeKind,
            label: `${task.key} · ${task.role}`,
            state: worker?.state ?? (plan?.status === "launched" ? "unknown" : "planned")
          }
        })
      : workers
          .filter((worker) => worker.role !== "integrator" && worker.role !== "integration")
          .map((worker) => ({
            dependsOn: worker.depends_on_worker_ids.map((id) => `task:${id}`),
            detail: worker.worktree.branch,
            id: `task:${worker.id}`,
            kind: "worker" as GraphNodeKind,
            label: worker.role,
            state: worker.state
          }))
  const depth = layer(sources)
  const columns = Math.max(0, ...[...depth.values()].map((value) => value + 1))
  const rows = new Map<number, number>()
  const nodes: GraphNode[] = sources.map((source) => {
    const column = depth.get(source.id) ?? 0
    const row = rows.get(column) ?? 0
    rows.set(column, row + 1)
    return {
      column,
      detail: source.detail,
      id: source.id,
      kind: source.kind,
      label: source.label,
      row,
      state: source.state
    }
  })
  const edges: GraphEdge[] = sources.flatMap((source) => source.dependsOn.map((from) => ({ from, to: source.id })))
  if (integration !== undefined) {
    nodes.push({
      column: columns,
      detail: integration.completion?.detail ?? "started",
      id: "integration",
      kind: "integration",
      label: `integration a${integration.attempt}`,
      row: 0,
      state: integration.status
    })
    const leaves = sources.filter((source) => !sources.some((other) => other.dependsOn.includes(source.id)))
    edges.push(...leaves.map((leaf) => ({ from: leaf.id, to: "integration" })))
    if (handoff !== undefined) {
      nodes.push({
        column: columns + 1,
        detail: handoff.result === null ? handoff.plan.branch : `PR #${handoff.result.pullRequest.number}`,
        id: "handoff",
        kind: "handoff",
        label: "GitHub handoff",
        row: 0,
        state: handoff.status
      })
      edges.push({ from: "integration", to: "handoff" })
    }
  }
  return { edges, nodes }
}

export const goalView = (snapshot: ConsoleSnapshot, goalId: string): GoalView | null => {
  const goal = snapshot.goals.find((candidate) => candidate.id === goalId)
  if (goal === undefined) {
    return null
  }
  const plans = snapshot.plans
    .filter((plan) => plan.goalId === goalId)
    .sort((left, right) => left.revision - right.revision)
  const plan = plans.find((candidate) => candidate.status === "launched") ?? plans.at(-1) ?? null
  const workers = snapshot.workers.filter((worker) => worker.goal_id === goalId)
  const integrations = snapshot.integrations
    .filter((integration) => integration.goal_id === goalId)
    .sort(byTime((item) => item.started_at))
  const handoffs = snapshot.handoffs.filter((handoff) => handoff.goal_id === goalId)
  const latest = integrations.at(-1)
  const { edges, nodes } = graph(
    plan,
    workers,
    latest,
    handoffs.find((handoff) => handoff.integration_id === latest?.id)
  )
  return {
    decisions: snapshot.decisions
      .filter((decision) => decision.goal_id === goalId)
      .sort(byTime((item) => item.requested_at)),
    edges,
    goal,
    handoffs,
    integrations,
    nodes,
    plan,
    plans,
    taskKeys: Object.fromEntries((plan?.launch?.workers ?? []).map((entry) => [entry.workerId, entry.taskKey])),
    validations: snapshot.validations.filter((validation) => validation.goalId === goalId),
    workers
  }
}

/** Cards waiting on the engineer, oldest first, across every goal and project. */
export const pendingDecisions = (snapshot: ConsoleSnapshot): ConsoleDecision[] =>
  snapshot.decisions.filter((decision) => decision.status === "requested").sort(byTime((item) => item.requested_at))

/** How far the read model trails the clock; the console shows this instead of implying real time. */
export const freshnessLag = (snapshot: ConsoleSnapshot): number | null =>
  snapshot.freshness === null ? null : Date.parse(snapshot.readAt) - Date.parse(snapshot.freshness.applied_at)
