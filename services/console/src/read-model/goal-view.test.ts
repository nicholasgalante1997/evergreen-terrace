/** @module Goal-view assembly tests: plan tasks, launched workers, integration, and handoff form one graph. */

import { expect, test } from "bun:test"
import { freshnessLag, goalView, pendingDecisions } from "./goal-view"
import type { ConsoleSnapshot } from "./read-model.types"

const goalId = "11111111-1111-4111-8111-111111111111"
const worker = (id: string, role: string, state: string) => ({
  adapter: "claude",
  brief_sha256: null,
  depends_on_worker_ids: [],
  goal_id: goalId,
  id,
  lease_expires_at: null,
  lease_owner: null,
  project_id: "p",
  role,
  state,
  state_detail: "",
  updated_at: "2026-10-26T10:00:00Z",
  worktree: { attempt: 1, baseSha: "a", branch: `feature/${role}`, worktreePath: "/w" }
})
const task = (key: string, dependsOn: string[] = []) => ({
  acceptance: [],
  briefLength: 1,
  dependsOn,
  key,
  role: `${key}-writer`,
  scope: [`${key}/**`],
  title: key
})

const snapshot = (overrides: Partial<ConsoleSnapshot> = {}): ConsoleSnapshot => ({
  decisions: [],
  events: [],
  freshness: { applied_at: "2026-10-26T10:00:00Z", event_id: "e", occurred_at: "2026-10-26T10:00:00Z" },
  goals: [
    {
      base_ref: "main",
      base_sha: "a",
      description: "d",
      id: goalId,
      priority_class: "p1",
      project_id: "p",
      state: "submitted",
      submitted_at: "2026-10-26T09:00:00Z",
      title: "Goal",
      updated_at: "2026-10-26T09:00:00Z"
    }
  ],
  handoffs: [],
  integrations: [],
  onboardings: [],
  plans: [
    {
      decisionId: null,
      detail: "",
      goalId,
      id: "plan",
      launch: {
        workers: [
          { taskKey: "schema", workerId: "w1" },
          { taskKey: "api", workerId: "w2" }
        ]
      },
      overlaps: [],
      projectId: "p",
      proposal: {
        contract: { acceptance: [], assumptions: [], outOfScope: [] },
        integrateAfterGoalIds: [],
        questions: [],
        risks: [],
        summary: "s",
        tasks: [task("schema"), task("api", ["schema"]), task("docs")]
      },
      questionDecisionIds: [],
      revision: 1,
      status: "launched",
      updatedAt: "2026-10-26T09:30:00Z"
    }
  ],
  preferences: [],
  readAt: "2026-10-26T10:00:05Z",
  validations: [],
  workers: [worker("w1", "schema-writer", "completed"), worker("w2", "api-writer", "running")],
  ...overrides
})

test("lays plan tasks out by dependency depth and shows each launched worker's state", () => {
  const view = goalView(snapshot(), goalId)
  expect(view?.nodes.map((node) => [node.id, node.column, node.row, node.state])).toEqual([
    ["task:schema", 0, 0, "completed"],
    ["task:api", 1, 0, "running"],
    ["task:docs", 0, 1, "unknown"]
  ])
  expect(view?.edges).toEqual([{ from: "task:schema", to: "task:api" }])
  expect(view?.taskKeys).toEqual({ w1: "schema", w2: "api" })
})

test("the latest integration and its handoff close the graph", () => {
  const integration = {
    attempt: 2,
    base_sha: "a",
    completion: null,
    goal_id: goalId,
    id: "i2",
    project_id: "p",
    resolves_integration_id: null,
    started_at: "2026-10-26T09:50:00Z",
    status: "validated",
    updated_at: "2026-10-26T09:55:00Z"
  }
  const view = goalView(
    snapshot({
      handoffs: [
        {
          decision_id: "d",
          detail: "",
          goal_id: goalId,
          id: "h",
          integration_id: "i2",
          plan: { baseRef: "main", branch: "b", headSha: "c", repository: "o/r", title: "t" },
          project_id: "p",
          result: { pullRequest: { number: 7, url: "https://github.com/o/r/pull/7" } },
          status: "completed",
          updated_at: "2026-10-26T09:58:00Z"
        }
      ],
      integrations: [
        { ...integration, attempt: 1, id: "i1", started_at: "2026-10-26T09:40:00Z", status: "conflicted" },
        integration
      ]
    }),
    goalId
  )
  expect(view?.nodes.slice(-2).map((node) => [node.id, node.column, node.state, node.detail])).toEqual([
    ["integration", 2, "validated", "started"],
    ["handoff", 3, "completed", "PR #7"]
  ])
  expect(view?.edges).toContainEqual({ from: "task:api", to: "integration" })
  expect(view?.edges).toContainEqual({ from: "task:docs", to: "integration" })
  expect(view?.edges).not.toContainEqual({ from: "task:schema", to: "integration" })
})

test("pending cards are oldest first, and lag is measured against the read time", () => {
  const decision = (id: string, status: "requested" | "approved", requestedAt: string) => ({
    category: "c",
    context: "",
    goal_id: null,
    id,
    options: [],
    project_id: "p",
    recommended_option_id: null,
    requested_at: requestedAt,
    resolution: null,
    resolved_at: null,
    status,
    title: id
  })
  const view = snapshot({
    decisions: [
      decision("b", "requested", "2026-10-26T09:10:00Z"),
      decision("a", "requested", "2026-10-26T09:00:00Z"),
      decision("c", "approved", "2026-10-26T08:00:00Z")
    ]
  })
  expect(pendingDecisions(view).map((entry) => entry.id)).toEqual(["a", "b"])
  expect(freshnessLag(view)).toBe(5_000)
  expect(freshnessLag(snapshot({ freshness: null }))).toBeNull()
})
