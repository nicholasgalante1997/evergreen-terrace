/** @module The mayor: turns a durable goal into an approved plan, then into scheduled workers. */

import { mayorPlanSchema, planTaskOrder } from "@evergreen-terrace/contracts"
import type { MayorPlan } from "@evergreen-terrace/contracts"
import type { CommandGoalSnapshot, CommandPlanSnapshot } from "../command-api/command-api-client.types"
import { mayorPrompt, plannedWorkerBrief } from "./mayor-brief"
import type { ActiveClaim } from "./mayor-brief"
import type {
  MayorPlannerPorts,
  PlanDraftInput,
  PlanDraftOutcome,
  PlanDraftStarted,
  PlanLaunchInput,
  PlanLaunchOutcome
} from "./mayor-planner.types"
import { crossGoalOverlaps, flaggedRisks, maximumPlanTasks, planIssues } from "./plan-checks"
import { runStructuredSession } from "./structured-output"

export class PlanningPreconditionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PlanningPreconditionError"
  }
}

const latestPlan = (plans: readonly CommandPlanSnapshot[]): CommandPlanSnapshot | undefined =>
  [...plans].sort((left, right) => left.revision - right.revision).at(-1)

/**
 * Drafting records intent (`plan.updated: drafting`) before the mayor session
 * starts, runs the session read-only, and records either a validated plan
 * with its approval card, the mayor's questions as cards, or a failure. A
 * draft interrupted by a bridge restart is failed, never resumed or replayed.
 *
 * Launching happens only after the engineer approved that exact plan. It is
 * idempotent: a re-run after a crash reuses the worktrees and workers it
 * already created.
 */
export class MayorPlanner {
  readonly #drafting = new Set<string>()

  constructor(private readonly ports: MayorPlannerPorts) {}

  async draft(input: PlanDraftInput): Promise<PlanDraftStarted> {
    const { commandApi } = this.ports
    const goal = await commandApi.getGoal(input.goalId)
    let latest = latestPlan(await commandApi.listGoalPlans(goal.id))
    if (latest?.status === "drafting") {
      if (this.#drafting.has(latest.id)) {
        throw new PlanningPreconditionError(`Plan ${latest.id} is already being drafted`)
      }
      await commandApi.completePlanDraft(latest.id, {
        detail: "The mayor session was interrupted (bridge restart). It is not resumed or replayed.",
        status: "failed"
      })
      latest = await commandApi.getPlan(latest.id)
    }
    const feedback = [
      ...(await this.recordedFeedback(latest)),
      ...(input.feedback?.trim() ? [input.feedback.trim()] : [])
    ]
    const policy = await this.ports.loadPolicy()
    const sessionId = crypto.randomUUID()
    const checkout = await this.ports.checkouts.create({
      baseSha: goal.baseSha,
      key: "mayor",
      ownerId: sessionId,
      projectId: goal.projectId,
      purpose: "plans"
    })
    const started = await commandApi.startPlanDraft({
      feedback: feedback.join("\n").slice(0, 8_000),
      goalId: goal.id,
      idempotencyKey: input.idempotencyKey ?? `plan-draft-${sessionId}`,
      mayor: {
        adapter: input.adapter,
        artifactDirectory: checkout.artifactDirectory,
        checkoutPath: checkout.checkoutPath
      },
      revisionOf: latest?.id ?? null
    })
    if (!started.created) {
      const existing = await commandApi.getPlan(started.planId)
      return { completion: Promise.resolve(this.outcome(existing)), planId: existing.id, revision: existing.revision }
    }
    this.#drafting.add(started.planId)
    const completion = this.runDraft({
      adapter: input.adapter,
      checkout,
      feedback,
      goal,
      planId: started.planId,
      policy,
      previous: latest?.proposal ?? null
    }).finally(() => this.#drafting.delete(started.planId))
    completion.catch(() => undefined)
    return { completion, planId: started.planId, revision: started.revision }
  }

  async launch(input: PlanLaunchInput): Promise<PlanLaunchOutcome> {
    const { commandApi } = this.ports
    const begun = await commandApi.beginPlanLaunch(input.planId)
    const plan = await commandApi.getPlan(input.planId)
    if (begun.status === "rejected") {
      return { detail: plan.detail, planId: plan.id, status: "rejected" }
    }
    if (plan.proposal === null) {
      throw new PlanningPreconditionError(`Plan ${plan.id} has no proposal`)
    }
    const goal = await commandApi.getGoal(plan.goalId)
    const policy = await this.ports.loadPolicy()
    const proposal = plan.proposal
    const workers =
      begun.status === "launched" && plan.launch !== null
        ? plan.launch.workers
        : await this.createWorkers(plan, proposal, goal, input, policy.validation.commands)
    if (begun.status !== "launched") {
      await commandApi.completePlanLaunch(plan.id, { workers })
    }
    const schedule = this.ports.scheduler.start({
      goalId: goal.id,
      maxConcurrency: input.maxConcurrency,
      workerIds: workers.map((worker) => worker.workerId)
    })
    return {
      completion: schedule.completion,
      goalId: goal.id,
      planId: plan.id,
      schedulerId: schedule.schedulerId,
      status: "launched",
      workers
    }
  }

  private async createWorkers(
    plan: CommandPlanSnapshot,
    proposal: MayorPlan,
    goal: CommandGoalSnapshot,
    input: PlanLaunchInput,
    validationCommands: readonly string[]
  ): Promise<Array<{ taskKey: string; workerId: string }>> {
    const { commandApi } = this.ports
    const existing = await commandApi.listGoalWorkers(goal.id)
    const workerIds = new Map<string, string>()
    for (const key of planTaskOrder(proposal.tasks)) {
      const task = proposal.tasks.find((candidate) => candidate.key === key)
      if (task === undefined) {
        throw new Error(`Plan ${plan.id} has no task ${key}`)
      }
      const idempotencyKey = `plan-${plan.id}-${key}`
      const prior = existing.find((worker) => worker.idempotencyKey === idempotencyKey)
      if (prior !== undefined) {
        workerIds.set(key, prior.id)
        continue
      }
      const conflict = existing.find((worker) => worker.role === task.role)
      if (conflict !== undefined) {
        throw new PlanningPreconditionError(
          `Goal ${goal.id} already has a ${task.role} worker (${conflict.id}) outside this plan`
        )
      }
      const worktree = await this.ports.worktrees.prepareOrReuse({
        attempt: 1,
        baseRef: goal.baseRef,
        baseSha: goal.baseSha,
        branchClass: input.branchClass,
        goalId: goal.id,
        role: task.role
      })
      const assigned = await commandApi.assignWorker({
        adapter: input.adapter,
        dependsOnWorkerIds: task.dependsOn.map((dependency) => {
          const workerId = workerIds.get(dependency)
          if (workerId === undefined) {
            throw new Error(`Task ${key} depends on ${dependency}, which has no worker yet`)
          }
          return workerId
        }),
        goalId: goal.id,
        idempotencyKey,
        projectId: goal.projectId,
        role: task.role,
        worktree: {
          artifactDirectory: worktree.artifactDirectory,
          attempt: worktree.attempt,
          baseRef: worktree.baseRef,
          baseSha: worktree.baseSha,
          branch: worktree.branch,
          manifestPath: worktree.manifestPath,
          worktreePath: worktree.worktreePath
        }
      })
      workerIds.set(key, assigned.workerId)
    }
    const workers = [...workerIds.entries()].map(([taskKey, workerId]) => ({ taskKey, workerId }))
    await this.ports.scheduler.recordBriefs(
      workers.map(({ taskKey, workerId }) => {
        const task = proposal.tasks.find((candidate) => candidate.key === taskKey)
        if (task === undefined) {
          throw new Error(`Plan ${plan.id} has no task ${taskKey}`)
        }
        return {
          prompt: plannedWorkerBrief({
            goalTitle: goal.title,
            plan: proposal,
            planId: plan.id,
            revision: plan.revision,
            task,
            validationCommands
          }),
          workerId
        }
      })
    )
    return workers
  }

  private async runDraft(input: {
    adapter: PlanDraftInput["adapter"]
    checkout: { artifactDirectory: string; checkoutPath: string }
    feedback: string[]
    goal: CommandGoalSnapshot
    planId: string
    policy: Awaited<ReturnType<MayorPlannerPorts["loadPolicy"]>>
    previous: MayorPlan | null
  }): Promise<PlanDraftOutcome> {
    const { commandApi } = this.ports
    try {
      const others = (await commandApi.listActiveProjectPlans(input.goal.projectId)).filter(
        (plan) => plan.goalId !== input.goal.id && plan.proposal !== null
      )
      const titles = new Map<string, string>()
      for (const other of others) {
        if (!titles.has(other.goalId)) {
          titles.set(other.goalId, (await commandApi.getGoal(other.goalId)).title)
        }
      }
      const activeClaims: ActiveClaim[] = others.flatMap((other) =>
        (other.proposal?.tasks ?? []).map((task) => ({
          goalId: other.goalId,
          goalTitle: titles.get(other.goalId) ?? other.goalId,
          scope: task.scope,
          taskKey: task.key
        }))
      )
      const preferences = await commandApi.listPreferences(input.goal.projectId, true)
      const trackedFiles = await this.ports.trackedFiles(input.goal.baseSha)
      const maximumTasks = maximumPlanTasks(input.policy)
      const outcome = await runStructuredSession(
        this.ports.agent,
        {
          adapter: input.adapter,
          artifactDirectory: input.checkout.artifactDirectory,
          checkoutPath: input.checkout.checkoutPath,
          label: `mayor:${input.planId}`,
          prompt: mayorPrompt({
            activeClaims,
            feedback: input.feedback,
            goal: input.goal,
            maximumTasks,
            policy: input.policy,
            preferences,
            previous: input.previous
          })
        },
        mayorPlanSchema,
        (plan) => planIssues(plan, { activeGoalIds: new Set(titles.keys()), maximumTasks, trackedFiles })
      )
      if (!outcome.ok) {
        await commandApi.completePlanDraft(input.planId, { detail: outcome.detail, status: "failed" })
      } else {
        await commandApi.completePlanDraft(input.planId, {
          flaggedRisks: flaggedRisks(outcome.value, input.policy),
          overlaps: crossGoalOverlaps(
            outcome.value,
            others.map((other) => ({ goalId: other.goalId, planId: other.id, tasks: other.proposal?.tasks ?? [] })),
            trackedFiles
          ),
          proposal: outcome.value,
          status: "proposed"
        })
      }
    } catch (error) {
      await commandApi
        .completePlanDraft(input.planId, {
          detail: `Planning failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 8_000),
          status: "failed"
        })
        .catch(() => undefined)
    }
    return this.outcome(await commandApi.getPlan(input.planId))
  }

  /** Answers to the previous revision's questions and its revision note, verbatim. */
  private async recordedFeedback(latest: CommandPlanSnapshot | undefined): Promise<string[]> {
    if (latest === undefined) {
      return []
    }
    const feedback: string[] = []
    for (const decisionId of latest.questionDecisionIds) {
      const decision = await this.ports.commandApi.getDecision(decisionId)
      const selected = decision.options.find((option) => option.id === decision.resolution?.selectedOptionId)
      const answer = decision.status === "approved" && selected !== undefined ? selected.label : "no option chosen"
      const note = decision.resolution?.note.trim() ?? ""
      feedback.push(`${decision.title} Answer: ${answer}.${note.length === 0 ? "" : ` Note: ${note}`}`)
    }
    if (latest.decisionId !== null) {
      const decision = await this.ports.commandApi.getDecision(latest.decisionId)
      const note = decision.resolution?.note.trim() ?? ""
      if (decision.status !== "requested" && note.length > 0) {
        feedback.push(`Revision request: ${note}`)
      }
    }
    return feedback
  }

  private outcome(plan: CommandPlanSnapshot): PlanDraftOutcome {
    return {
      decisionId: plan.decisionId,
      detail: plan.detail,
      planId: plan.id,
      questionDecisionIds: plan.questionDecisionIds,
      status: plan.status
    }
  }
}
