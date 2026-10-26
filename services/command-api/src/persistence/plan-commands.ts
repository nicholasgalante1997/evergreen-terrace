/** @module Mayor goal-plan command transactions, gated by one approval decision card per plan. */

import { createHash } from "node:crypto"
import { createPlanUpdatedEvent, planTaskOrder } from "@evergreen-terrace/contracts"
import type {
  DecisionRequest,
  EventEnvelope,
  MayorPlan,
  PlanDraftCompletion,
  PlanDraftStart,
  PlanLaunchCompletion,
  PlanProposalSummary,
  PlanQuestion
} from "@evergreen-terrace/contracts"
import type { SQL } from "bun"
import { boundedContext, createDecisionCard } from "./decision-card"
import { DecisionRepository } from "./decision-repository"
import { EventStore } from "./event-store"
import { EvidenceConflictError, EvidenceNotFoundError } from "./evidence-error"
import { GoalRepository } from "./goal-repository"
import { OutboxRepository } from "./outbox-repository"
import { PlanRepository } from "./plan-repository"
import type { PlanBeginLaunchResult, PlanCommandResult } from "./command-database.types"
import type { PlanChange, PlanRecord } from "./plan-repository.types"
import { WorkerRepository } from "./worker-repository"

const actor = { id: "command-api", kind: "system" } as const

/** The option an engineer must select for the plan's workers to launch. */
export const planApproveOptionId = "approve"
export const planReviseOptionId = "revise"

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex")

export const proposalSummary = (proposal: MayorPlan): PlanProposalSummary => ({
  ...proposal,
  tasks: proposal.tasks.map(({ brief, ...task }) => ({ ...task, briefLength: brief.length, briefSha256: sha256(brief) }))
})

const payload = (plan: PlanRecord) => ({
  decisionId: plan.decisionId,
  detail: plan.detail,
  goalId: plan.goalId,
  id: plan.id,
  launch: plan.launch,
  mayor: plan.mayor,
  overlaps: plan.overlaps,
  projectId: plan.projectId,
  proposal: plan.proposal === null ? null : proposalSummary(plan.proposal),
  questionDecisionIds: plan.questionDecisionIds,
  revision: plan.revision,
  revisionOf: plan.revisionOf,
  status: plan.status
})

const bullets = (items: readonly string[]): string[] => items.map((item) => `- ${item}`)

/** The approval card restates the whole plan except brief text; approval covers exactly these tasks. */
export const planApprovalDecision = (plan: PlanRecord, goalTitle: string, proposal: MayorPlan): DecisionRequest => {
  const order = planTaskOrder(proposal.tasks)
  const tasks = order.flatMap((key, index) => {
    const task = proposal.tasks.find((candidate) => candidate.key === key)
    return task === undefined
      ? []
      : [
          `${index + 1}. ${task.key} (role ${task.role}): ${task.title}`,
          `   scope: ${task.scope.join(", ")}`,
          `   depends on: ${task.dependsOn.length === 0 ? "nothing" : task.dependsOn.join(", ")}`,
          `   brief: ${task.brief.length} characters, SHA-256 ${sha256(task.brief)}`
        ]
  })
  const flagged = new Set(plan.flaggedRisks)
  return {
    category: "plan_approval",
    context: boundedContext(
      [
        `Plan ${plan.id} (revision ${plan.revision}) for goal "${goalTitle}".`,
        "",
        proposal.summary,
        "",
        "Acceptance:",
        ...bullets(proposal.contract.acceptance),
        ...(proposal.contract.outOfScope.length === 0 ? [] : ["Out of scope:", ...bullets(proposal.contract.outOfScope)]),
        ...(proposal.contract.assumptions.length === 0
          ? []
          : ["Assumptions:", ...bullets(proposal.contract.assumptions)]),
        "",
        `Workers, in dependency order (${proposal.tasks.length}):`,
        ...tasks,
        "",
        ...(proposal.risks.length === 0
          ? ["Risks: none stated."]
          : [
              "Risks:",
              ...proposal.risks.map(
                (risk) =>
                  `- [${risk.category}${flagged.has(risk.category as never) ? ", requires a decision under .et" : ""}] ${risk.detail}${risk.mitigation.length === 0 ? "" : ` Mitigation: ${risk.mitigation}`}`
              )
            ]),
        ...(plan.overlaps.length === 0
          ? []
          : [
              "",
              "Scope overlaps with other active goals:",
              ...plan.overlaps.map(
                (overlap) =>
                  `- ${overlap.taskKey} and goal ${overlap.otherGoalId} task ${overlap.otherTaskKey}: ${overlap.paths.slice(0, 10).join(", ")}${overlap.paths.length > 10 ? ` +${overlap.paths.length - 10} more` : ""}`
              )
            ]),
        ...(proposal.integrateAfterGoalIds.length === 0
          ? []
          : ["", `Integrate after goals: ${proposal.integrateAfterGoalIds.join(", ")}`]),
        ...(proposal.validation.notes.length === 0
          ? []
          : ["", "Validation notes:", ...bullets(proposal.validation.notes)]),
        "",
        "Each worker runs in its own factory worktree. Files changed outside a worker's scope block integration.",
        "Read every brief with evergreen.plan.status before approving."
      ],
      "Read the full plan with evergreen.plan.status."
    ),
    goalId: plan.goalId,
    idempotencyKey: `plan-approval-${plan.id}`,
    options: [
      {
        detail: "Create the listed worktrees and workers and start the schedule.",
        id: planApproveOptionId,
        label: "Launch workers"
      },
      {
        detail: "Do not launch. The mayor drafts a new revision; write the requested change in the resolution note.",
        id: planReviseOptionId,
        label: "Request a revision"
      },
      { detail: "Do not launch this plan.", id: "reject", label: "Reject" }
    ],
    projectId: plan.projectId,
    recommendedOptionId: null,
    title: `Approve the plan for "${goalTitle}"`.slice(0, 240)
  }
}

const questionDecision = (plan: PlanRecord, goalTitle: string, question: PlanQuestion): DecisionRequest => ({
  category: "ambiguity",
  context: boundedContext(
    [
      `The mayor needs an answer before it can plan goal "${goalTitle}" (plan ${plan.id}, revision ${plan.revision}).`,
      "",
      question.question,
      "",
      "Resolving this card does not start any work. Draft the next revision with evergreen.plan.draft."
    ],
    "Read the plan with evergreen.plan.status."
  ),
  goalId: plan.goalId,
  idempotencyKey: `plan-question-${plan.id}-${question.id}`,
  options: question.options,
  projectId: plan.projectId,
  recommendedOptionId: question.recommendedOptionId,
  title: question.question.slice(0, 240)
})

export class PlanCommands {
  readonly #decisions: DecisionRepository
  readonly #events: EventStore
  readonly #goals: GoalRepository
  readonly #outbox: OutboxRepository
  readonly #plans: PlanRepository
  readonly #workers: WorkerRepository

  constructor(transaction: SQL) {
    this.#decisions = new DecisionRepository(transaction)
    this.#events = new EventStore(transaction)
    this.#goals = new GoalRepository(transaction)
    this.#outbox = new OutboxRepository(transaction)
    this.#plans = new PlanRepository(transaction)
    this.#workers = new WorkerRepository(transaction)
  }

  /**
   * Records intent before the mayor session starts. A goal has one plan
   * history; a new revision is admitted only when the latest one can no
   * longer launch and every question it raised has an answer.
   */
  async startDraft(input: PlanDraftStart): Promise<PlanCommandResult> {
    const projectId = await this.#goals.findProjectId(input.goalId)
    if (projectId === undefined) {
      throw new EvidenceNotFoundError(`Goal not found: ${input.goalId}`)
    }
    const replay = await this.#plans.findByIdempotency(projectId, input.idempotencyKey)
    if (replay !== undefined) {
      return { created: false, planId: replay.id, revision: replay.revision, status: replay.status }
    }
    await this.#plans.lockGoal(input.goalId)
    const latest = await this.#plans.findLatestForGoal(input.goalId)
    if ((latest?.id ?? null) !== input.revisionOf) {
      throw new EvidenceConflictError(
        latest === undefined
          ? "The goal has no plan yet; revisionOf must be null"
          : `A new draft must revise the latest plan ${latest.id} (revision ${latest.revision})`
      )
    }
    if (latest !== undefined) {
      await this.assertRevisable(latest)
    }

    const planId = crypto.randomUUID()
    const record: PlanRecord = {
      createdAt: new Date(),
      decisionId: null,
      detail: "",
      feedback: input.feedback,
      flaggedRisks: [],
      goalId: input.goalId,
      id: planId,
      idempotencyKey: input.idempotencyKey,
      lastEventId: "",
      launch: null,
      mayor: input.mayor,
      overlaps: [],
      projectId,
      proposal: null,
      questionDecisionIds: [],
      revision: (latest?.revision ?? 0) + 1,
      revisionOf: input.revisionOf,
      sequence: 1,
      status: "drafting",
      updatedAt: new Date()
    }
    const event = createPlanUpdatedEvent({
      actor: { id: "mayor", kind: "mayor" },
      causationId: latest?.lastEventId ?? null,
      correlationId: crypto.randomUUID(),
      plan: payload(record),
      sequence: 1
    })
    await this.#plans.create({ ...record, lastEventId: event.eventId })
    await this.publish(event)
    return { created: true, planId, revision: record.revision, status: "drafting" }
  }

  /** Records the mayor's validated output: question cards, or one approval card. */
  async completeDraft(planId: string, completion: PlanDraftCompletion): Promise<PlanCommandResult> {
    const plan = await this.lock(planId)
    if (plan.status !== "drafting") {
      const settled =
        completion.status === "failed"
          ? plan.status === "failed"
          : plan.status === "proposed" || plan.status === "needs_input"
      if (settled) {
        return { created: false, planId, revision: plan.revision, status: plan.status }
      }
      throw new EvidenceConflictError(`Plan ${planId} is ${plan.status}, not drafting`)
    }
    if (completion.status === "failed") {
      await this.transition(
        plan,
        { ...this.unchanged(plan), detail: completion.detail, status: "failed" },
        plan.lastEventId,
        []
      )
      return { created: true, planId, revision: plan.revision, status: "failed" }
    }

    const proposal = completion.proposal
    for (const goalId of proposal.integrateAfterGoalIds) {
      if (goalId === plan.goalId || (await this.#goals.findProjectId(goalId)) !== plan.projectId) {
        throw new EvidenceConflictError(`integrateAfterGoalIds must name other goals in ${plan.projectId}: ${goalId}`)
      }
    }
    const goal = await this.#goals.findById(plan.goalId)
    const goalTitle = goal?.title ?? plan.goalId
    const correlationId = crypto.randomUUID()
    const staged: PlanRecord = { ...plan, flaggedRisks: completion.flaggedRisks, overlaps: completion.overlaps, proposal }
    const cards: EventEnvelope[] = []
    if (proposal.questions.length > 0) {
      const questionDecisionIds: string[] = []
      for (const question of proposal.questions) {
        const card = await createDecisionCard(
          this.#decisions,
          questionDecision(staged, goalTitle, question),
          correlationId
        )
        questionDecisionIds.push(card.decisionId)
        cards.push(card.event)
      }
      const detail = `The mayor raised ${proposal.questions.length} question(s); answer them, then draft the next revision.`
      await this.transition(
        staged,
        { ...this.unchanged(staged), detail, questionDecisionIds, status: "needs_input" },
        cards[0]?.eventId ?? null,
        cards
      )
      return { created: true, planId, revision: plan.revision, status: "needs_input" }
    }
    const card = await createDecisionCard(
      this.#decisions,
      planApprovalDecision(staged, goalTitle, proposal),
      correlationId
    )
    await this.transition(
      staged,
      {
        ...this.unchanged(staged),
        decisionId: card.decisionId,
        detail: "Awaiting the engineer's approval.",
        status: "proposed"
      },
      card.event.eventId,
      [card.event]
    )
    return { created: true, decisionId: card.decisionId, planId, revision: plan.revision, status: "proposed" }
  }

  /**
   * Moves an approved plan to `launching` before any worktree is created.
   * Any other resolution ends it `rejected`. Re-entering `launching` (recovery)
   * is reported as `resumed`.
   */
  async beginLaunch(planId: string): Promise<PlanBeginLaunchResult> {
    const plan = await this.lock(planId)
    if (plan.status === "launched" || plan.status === "rejected") {
      return { planId, resumed: false, status: plan.status }
    }
    if (plan.status === "launching") {
      return { planId, resumed: true, status: "launching" }
    }
    if (plan.status !== "proposed" || plan.decisionId === null) {
      throw new EvidenceConflictError(`Plan ${planId} is ${plan.status}; only a proposed plan can launch`)
    }
    const decision = await this.#decisions.findById(plan.decisionId)
    if (decision === undefined) {
      throw new Error(`Plan ${planId} references a missing decision`)
    }
    if (decision.status === "requested") {
      throw new EvidenceConflictError(`Plan ${planId} is awaiting approval of decision ${decision.id}`)
    }
    const approved = decision.status === "approved" && decision.resolution?.selectedOptionId === planApproveOptionId
    const status = approved ? "launching" : "rejected"
    const detail = approved
      ? "Approved; creating the planned workers."
      : decision.resolution?.selectedOptionId === planReviseOptionId
        ? `Revision requested: ${decision.resolution.note}`.slice(0, 8_000)
        : `Decision ${decision.id} did not approve the plan.`
    await this.transition(
      plan,
      { ...this.unchanged(plan), detail, status },
      decision.resolvedEventId ?? plan.lastEventId,
      []
    )
    return { planId, resumed: false, status }
  }

  async completeLaunch(planId: string, launch: PlanLaunchCompletion): Promise<PlanCommandResult> {
    const plan = await this.lock(planId)
    if (plan.status === "launched") {
      return { created: false, planId, revision: plan.revision, status: "launched" }
    }
    if (plan.status !== "launching" || plan.proposal === null) {
      throw new EvidenceConflictError(`Plan ${planId} is ${plan.status}, not launching`)
    }
    const expected = new Set(plan.proposal.tasks.map((task) => task.key))
    const given = new Set(launch.workers.map((worker) => worker.taskKey))
    if (
      given.size !== launch.workers.length ||
      given.size !== expected.size ||
      [...given].some((key) => !expected.has(key))
    ) {
      throw new EvidenceConflictError("A launch must name exactly one worker for every planned task")
    }
    for (const { taskKey, workerId } of launch.workers) {
      const worker = await this.#workers.findById(workerId)
      if (worker?.goalId !== plan.goalId) {
        throw new EvidenceConflictError(`Worker ${workerId} for task ${taskKey} does not belong to goal ${plan.goalId}`)
      }
    }
    await this.transition(
      plan,
      { ...this.unchanged(plan), detail: `Launched ${launch.workers.length} worker(s).`, launch, status: "launched" },
      plan.lastEventId,
      []
    )
    return { created: true, planId, revision: plan.revision, status: "launched" }
  }

  private async assertRevisable(latest: PlanRecord): Promise<void> {
    if (latest.status === "drafting") {
      throw new EvidenceConflictError(`Plan ${latest.id} is still drafting; fail it before drafting again`)
    }
    if (latest.status === "launching" || latest.status === "launched") {
      throw new EvidenceConflictError(`Plan ${latest.id} is ${latest.status}; rework needs a new goal`)
    }
    if (latest.status === "proposed" && latest.decisionId !== null) {
      const decision = await this.#decisions.findById(latest.decisionId)
      if (decision?.status === "requested") {
        throw new EvidenceConflictError(`Plan ${latest.id} is awaiting approval of decision ${latest.decisionId}`)
      }
      if (decision?.status === "approved" && decision.resolution?.selectedOptionId === planApproveOptionId) {
        throw new EvidenceConflictError(`Plan ${latest.id} is approved; launch it instead of drafting again`)
      }
    }
    if (latest.status === "needs_input") {
      for (const decisionId of latest.questionDecisionIds) {
        if ((await this.#decisions.findById(decisionId))?.status === "requested") {
          throw new EvidenceConflictError(`Answer the mayor's question first: decision ${decisionId}`)
        }
      }
    }
  }

  private unchanged(plan: PlanRecord): Omit<PlanChange, "eventId" | "sequence"> {
    return {
      decisionId: plan.decisionId,
      detail: plan.detail,
      flaggedRisks: plan.flaggedRisks,
      launch: plan.launch,
      overlaps: plan.overlaps,
      proposal: plan.proposal,
      questionDecisionIds: plan.questionDecisionIds,
      status: plan.status
    }
  }

  private async transition(
    plan: PlanRecord,
    change: Omit<PlanChange, "eventId" | "sequence">,
    causationId: string | null,
    precedingEvents: readonly EventEnvelope[]
  ): Promise<void> {
    const sequence = plan.sequence + 1
    const event = createPlanUpdatedEvent({
      actor,
      causationId,
      correlationId: precedingEvents[0]?.correlationId ?? crypto.randomUUID(),
      plan: payload({ ...plan, ...change }),
      sequence
    })
    await this.#plans.update(plan.id, { ...change, eventId: event.eventId, sequence })
    for (const preceding of precedingEvents) {
      await this.publish(preceding)
    }
    await this.publish(event)
  }

  private async lock(planId: string): Promise<PlanRecord> {
    const plan = await this.#plans.findByIdForUpdate(planId)
    if (plan === undefined) {
      throw new EvidenceNotFoundError(`Plan not found: ${planId}`)
    }
    return plan
  }

  private async publish(event: EventEnvelope): Promise<void> {
    await this.#events.append(event)
    await this.#outbox.enqueue(event)
  }
}
