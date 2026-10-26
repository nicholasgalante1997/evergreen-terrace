/** @module Mayor planner tests: drafting is validated and recorded; launching is gated and idempotent. */

import { describe, expect, test } from "bun:test"
import { mayorPlanSchema } from "@evergreen-terrace/contracts"
import type {
  PlanDraftCompletionInput,
  PlanDraftStartInput,
  PlanLaunchCompletion,
  WorkerAssignment
} from "@evergreen-terrace/contracts"
import { parseProjectPolicy } from "@evergreen-terrace/project-policy"
import type {
  CommandDecisionSnapshot,
  CommandGoalSnapshot,
  CommandPlanSnapshot,
  CommandWorkerSnapshot
} from "../command-api/command-api-client.types"
import type { WorkerBriefEntry, WorkerScheduleInput } from "../workers/worker-scheduler.types"
import type { WorktreePreparation } from "../worktrees/worktree.types"
import { MayorPlanner } from "./mayor-planner"
import type { ReadOnlyAgentPort, ReadOnlyAgentRun } from "./read-only-agent.types"

const policy = parseProjectPolicy(`
version = 1
project_id = "github.com/example/plans"
canonical_remote = "origin"
priority_classes = [{ name = "p1", weight = 50 }]
[goals]
max_concurrent = 4
[workers]
default_per_goal = 3
max_per_repository = 3
[branches]
protected = ["main"]
allowed_base_refs = ["main"]
classes = [{ name = "feature", prefix = "feature/" }]
[validation]
commands = ["bun test"]
[risk]
decision_required = ["migration", "security"]
`)

const goal: CommandGoalSnapshot = {
  baseRef: "main",
  baseSha: "a".repeat(40),
  constraints: ["No new dependencies."],
  description: "Add a health endpoint and show it in the UI.",
  id: crypto.randomUUID(),
  priorityClass: "p1",
  projectId: "github.com/example/plans",
  references: [],
  title: "Health endpoint"
}

const task = (key: string, scope: string[], dependsOn: string[] = []) => ({
  acceptance: [`${key} done`],
  brief: `Implement ${key}.`,
  dependsOn,
  key,
  role: `${key}-implementer`,
  scope,
  title: `Task ${key}`
})

const plan = (tasks: unknown[], extra: Record<string, unknown> = {}) => ({
  contract: { acceptance: ["GET /health returns 200."] },
  risks: [{ category: "migration", detail: "None really.", mitigation: "" }],
  summary: "API then UI.",
  tasks,
  ...extra
})

const reply = (value: unknown) => `Here is the plan.\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``

class ScriptedAgent implements ReadOnlyAgentPort {
  readonly prompts: string[] = []

  constructor(private readonly replies: string[]) {}

  async run(input: ReadOnlyAgentRun) {
    let prompt: string | null = input.prompt
    let turns = 0
    while (prompt !== null) {
      this.prompts.push(prompt)
      prompt = (await input.continueWith?.(this.replies[turns] ?? "")) ?? null
      turns += 1
    }
    return { stopReason: "end_turn", turns }
  }
}

/** In-memory command API with the same plan state rules the real one enforces. */
class FakePlanApi {
  readonly decisions = new Map<string, CommandDecisionSnapshot>()
  readonly plans = new Map<string, CommandPlanSnapshot>()
  readonly workers: CommandWorkerSnapshot[] = []
  readonly assignments: WorkerAssignment[] = []
  active: CommandPlanSnapshot[] = []

  async getGoal(goalId: string): Promise<CommandGoalSnapshot> {
    return goalId === goal.id ? goal : { ...goal, id: goalId, title: "Other goal" }
  }

  async listGoalPlans(goalId: string) {
    return [...this.plans.values()].filter((candidate) => candidate.goalId === goalId)
  }

  async getPlan(planId: string) {
    const found = this.plans.get(planId)
    if (found === undefined) {
      throw new Error(`no plan ${planId}`)
    }
    return found
  }

  async listActiveProjectPlans() {
    return this.active
  }

  async listPreferences() {
    return [{ key: "reports.length", value: "short" }] as never
  }

  async getDecision(decisionId: string) {
    const decision = this.decisions.get(decisionId)
    if (decision === undefined) {
      throw new Error(`no decision ${decisionId}`)
    }
    return decision
  }

  async startPlanDraft(input: PlanDraftStartInput) {
    const planId = crypto.randomUUID()
    const revision = (await this.listGoalPlans(input.goalId)).length + 1
    this.plans.set(planId, {
      decisionId: null,
      detail: "",
      feedback: input.feedback ?? "",
      flaggedRisks: [],
      goalId: input.goalId,
      id: planId,
      launch: null,
      mayor: input.mayor,
      overlaps: [],
      projectId: goal.projectId,
      proposal: null,
      questionDecisionIds: [],
      revision,
      revisionOf: input.revisionOf ?? null,
      status: "drafting"
    })
    return { created: true, planId, revision, status: "drafting" as const }
  }

  async completePlanDraft(planId: string, input: PlanDraftCompletionInput) {
    const current = await this.getPlan(planId)
    if (input.status === "failed") {
      this.plans.set(planId, { ...current, detail: input.detail, status: "failed" })
    } else {
      const proposal = mayorPlanSchema.parse(input.proposal)
      const decisionId = crypto.randomUUID()
      this.decisions.set(decisionId, {
        id: decisionId,
        options: [],
        resolution: null,
        status: "requested",
        title: "Approve"
      })
      this.plans.set(planId, {
        ...current,
        decisionId,
        flaggedRisks: input.flaggedRisks ?? [],
        overlaps: input.overlaps ?? [],
        proposal,
        status: "proposed"
      })
    }
    return { created: true, planId, revision: current.revision, status: (await this.getPlan(planId)).status }
  }

  async beginPlanLaunch(planId: string) {
    const current = await this.getPlan(planId)
    if (current.status === "launched" || current.status === "rejected") {
      return { planId, resumed: false, status: current.status }
    }
    const decision = await this.getDecision(current.decisionId ?? "")
    if (decision.status === "requested") {
      throw new Error(`Plan ${planId} is awaiting approval of decision ${decision.id}`)
    }
    const status = decision.resolution?.selectedOptionId === "approve" ? ("launching" as const) : ("rejected" as const)
    this.plans.set(planId, { ...current, detail: decision.resolution?.note ?? "", status })
    return { planId, resumed: false, status }
  }

  async completePlanLaunch(planId: string, launch: PlanLaunchCompletion) {
    const current = await this.getPlan(planId)
    this.plans.set(planId, { ...current, launch, status: "launched" })
    return { created: true, planId, revision: current.revision, status: "launched" as const }
  }

  async listGoalWorkers() {
    return this.workers
  }

  async assignWorker(input: WorkerAssignment) {
    this.assignments.push(input)
    const workerId = crypto.randomUUID()
    this.workers.push({
      ...input,
      briefSha256: null,
      id: workerId,
      leaseExpiresAt: null,
      leaseOwner: null,
      state: "assigned"
    })
    return { created: true, eventId: crypto.randomUUID(), state: "assigned" as const, workerId }
  }

  approve(planId: string, optionId = "approve", note = "") {
    const decisionId = this.plans.get(planId)?.decisionId ?? ""
    this.decisions.set(decisionId, {
      id: decisionId,
      options: [],
      resolution: { note, selectedOptionId: optionId, status: "approved" },
      status: "approved",
      title: "Approve"
    })
  }
}

const harness = (replies: string[]) => {
  const commandApi = new FakePlanApi()
  const agent = new ScriptedAgent(replies)
  const briefs: WorkerBriefEntry[] = []
  const schedules: WorkerScheduleInput[] = []
  const prepared: WorktreePreparation[] = []
  const planner = new MayorPlanner({
    agent,
    checkouts: {
      create: async (input) => ({
        artifactDirectory: `/tmp/et/${input.ownerId}/a`,
        checkoutPath: `/tmp/et/${input.ownerId}/c`
      })
    },
    commandApi,
    loadPolicy: async () => policy,
    scheduler: {
      recordBriefs: async (entries) => {
        briefs.push(...entries)
        return goal.id
      },
      start: (input) => {
        schedules.push(input)
        return {
          alreadyRunning: false,
          completion: Promise.resolve({ goalId: goal.id, outcomes: [], schedulerId: "s" }),
          goalId: goal.id,
          schedulerId: "s"
        }
      }
    },
    trackedFiles: async () => ["src/api/health.ts", "src/ui/page.tsx", "README.md"],
    worktrees: {
      prepareOrReuse: async (input) => {
        prepared.push(input)
        return {
          artifactDirectory: `/tmp/et/${input.role}/a`,
          attempt: input.attempt,
          baseRef: input.baseRef,
          baseSha: input.baseSha ?? goal.baseSha,
          branch: `feature/et-${input.goalId}/${input.role}`,
          createdAt: new Date().toISOString(),
          goalId: input.goalId,
          manifestPath: `/tmp/et/${input.role}/m.json`,
          projectId: goal.projectId,
          role: input.role,
          worktreePath: `/tmp/et/${input.role}/w`
        }
      }
    }
  })
  return { agent, briefs, commandApi, planner, prepared, schedules }
}

describe("drafting", () => {
  test("validates the plan, repairs host-check failures in the same session, and records flagged risks and overlaps", async () => {
    const overlapping = plan([task("api", ["src/api/**"]), task("ui", ["src/ui/**", "src/api/health.ts"])])
    const fixed = plan([task("api", ["src/api/**"]), task("ui", ["src/ui/**", "src/api/health.ts"], ["api"])])
    const { agent, commandApi, planner } = harness([reply(overlapping), reply(fixed)])
    const otherGoalId = crypto.randomUUID()
    commandApi.active = [
      {
        ...(await commandApi.getPlan(
          (
            await commandApi.startPlanDraft({
              goalId: otherGoalId,
              idempotencyKey: "o",
              mayor: { adapter: "claude", artifactDirectory: "/a", checkoutPath: "/c" }
            })
          ).planId
        )),
        proposal: mayorPlanSchema.parse(plan([task("docs", ["README.md"])])),
        status: "launched"
      }
    ]

    const started = await planner.draft({ adapter: "claude", goalId: goal.id })
    const outcome = await started.completion
    expect(outcome.status).toBe("proposed")
    expect(agent.prompts[0]).toContain("Add a health endpoint and show it in the UI.")
    expect(agent.prompts[0]).toContain("No new dependencies.")
    expect(agent.prompts[0]).toContain("At most 3 worker task(s)")
    expect(agent.prompts[0]).toContain(`goal ${otherGoalId} "Other goal", task docs: README.md`)
    expect(agent.prompts[0]).toContain("reports.length: short")
    expect(agent.prompts[1]).toContain("api and ui both claim src/api/health.ts")

    const stored = await commandApi.getPlan(started.planId)
    expect(stored.flaggedRisks).toEqual(["migration"])
    expect(stored.overlaps).toEqual([])
    expect(stored.proposal?.tasks.map((candidate) => candidate.key)).toEqual(["api", "ui"])
  })

  test("refuses more tasks than the repository's capacity and records the failure", async () => {
    const tooMany = plan(["a", "b", "c", "d"].map((key) => task(key, [`src/${key}/**`])))
    const { commandApi, planner } = harness([reply(tooMany), reply(tooMany), reply(tooMany)])
    const outcome = await (await planner.draft({ adapter: "claude", goalId: goal.id })).completion
    expect(outcome.status).toBe("failed")
    expect(outcome.detail).toContain("at most 3 task(s)")
    expect((await commandApi.listGoalPlans(goal.id))[0]?.status).toBe("failed")
  })

  test("fails an interrupted draft instead of resuming it, and carries the engineer's notes into the next revision", async () => {
    const { agent, commandApi, planner } = harness([reply(plan([task("api", ["src/api/**"])]))])
    const stale = await commandApi.startPlanDraft({
      goalId: goal.id,
      idempotencyKey: "stale",
      mayor: { adapter: "claude", artifactDirectory: "/a", checkoutPath: "/c" }
    })
    const outcome = await (
      await planner.draft({ adapter: "claude", feedback: "Keep it to one task.", goalId: goal.id })
    ).completion
    expect((await commandApi.getPlan(stale.planId)).status).toBe("failed")
    expect((await commandApi.getPlan(stale.planId)).detail).toContain("not resumed or replayed")
    expect(outcome.status).toBe("proposed")
    expect(agent.prompts[0]).toContain("Keep it to one task.")
  })
})

describe("launching", () => {
  const approvedPlan = async (tasks: unknown[]) => {
    const context = harness([reply(plan(tasks))])
    const outcome = await (await context.planner.draft({ adapter: "claude", goalId: goal.id })).completion
    return { ...context, planId: outcome.planId }
  }

  test("creates workers in dependency order with briefs that restate each scope claim, then starts the schedule", async () => {
    const { briefs, commandApi, planId, planner, schedules } = await approvedPlan([
      task("ui", ["src/ui/**"], ["api"]),
      task("api", ["src/api/**"])
    ])
    await expect(
      planner.launch({ adapter: "claude", branchClass: "feature", maxConcurrency: 2, planId })
    ).rejects.toThrow()
    commandApi.approve(planId)

    const outcome = await planner.launch({ adapter: "codex", branchClass: "feature", maxConcurrency: 2, planId })
    expect(outcome.status).toBe("launched")
    expect(commandApi.assignments.map((assignment) => assignment.role)).toEqual(["api-implementer", "ui-implementer"])
    const api = commandApi.workers[0]
    expect(commandApi.assignments[1]?.dependsOnWorkerIds).toEqual([api?.id ?? ""])
    expect(commandApi.assignments.every((assignment) => assignment.adapter === "codex")).toBe(true)
    const uiBrief = briefs.find((brief) => brief.workerId === commandApi.workers[1]?.id)?.prompt ?? ""
    expect(uiBrief).toContain("- src/ui/**")
    expect(uiBrief).toContain("Implement ui.")
    expect(uiBrief).toContain("blocks integration of the whole goal")
    expect((await commandApi.getPlan(planId)).launch?.workers).toHaveLength(2)
    expect(schedules[0]).toEqual({
      goalId: goal.id,
      maxConcurrency: 2,
      workerIds: commandApi.workers.map((worker) => worker.id)
    })

    await planner.launch({ adapter: "codex", branchClass: "feature", maxConcurrency: 2, planId })
    expect(commandApi.assignments).toHaveLength(2)
  })

  test("a launch interrupted after creating workers reuses them", async () => {
    const { commandApi, planId, planner, prepared } = await approvedPlan([task("api", ["src/api/**"])])
    commandApi.approve(planId)
    commandApi.workers.push({
      adapter: "claude",
      briefSha256: null,
      dependsOnWorkerIds: [],
      goalId: goal.id,
      id: crypto.randomUUID(),
      idempotencyKey: `plan-${planId}-api`,
      leaseExpiresAt: null,
      leaseOwner: null,
      projectId: goal.projectId,
      role: "api-implementer",
      state: "assigned",
      worktree: {
        artifactDirectory: "/a",
        attempt: 1,
        baseRef: "main",
        baseSha: goal.baseSha,
        branch: "b",
        manifestPath: "/m",
        worktreePath: "/w"
      }
    })
    await planner.launch({ adapter: "claude", branchClass: "feature", maxConcurrency: 1, planId })
    expect(commandApi.assignments).toHaveLength(0)
    expect(prepared).toHaveLength(0)
  })

  test("a revise or reject resolution launches nothing", async () => {
    const { commandApi, planId, planner } = await approvedPlan([task("api", ["src/api/**"])])
    commandApi.approve(planId, "revise", "Split it.")
    expect(await planner.launch({ adapter: "claude", branchClass: "feature", maxConcurrency: 1, planId })).toMatchObject({
      status: "rejected"
    })
    expect(commandApi.assignments).toHaveLength(0)
  })
})
