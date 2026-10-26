/** @module GitHub handoff command transactions, gated by an external-side-effect decision card. */

import { createHash } from "node:crypto"
import { createDecisionRequestedEvent, createHandoffUpdatedEvent } from "@evergreen-terrace/contracts"
import type { DecisionRequest, EventEnvelope, HandoffCompletion, HandoffPlan, HandoffRequest } from "@evergreen-terrace/contracts"
import type { SQL } from "bun"
import { DecisionRepository } from "./decision-repository"
import { EventStore } from "./event-store"
import { EvidenceConflictError, EvidenceNotFoundError } from "./evidence-error"
import { IntegrationRepository } from "./evidence-repository"
import { HandoffRepository } from "./handoff-repository"
import { OutboxRepository } from "./outbox-repository"
import type { HandoffBeginResult, HandoffCompletionResult, HandoffRequestResult } from "./command-database.types"
import type { HandoffRecord } from "./handoff-repository.types"

const actor = { id: "command-api", kind: "system" } as const

/** The option an engineer must select for execution to proceed. */
export const handoffApproveOptionId = "approve"

const payload = (handoff: HandoffRecord) => ({
  decisionId: handoff.decisionId,
  detail: handoff.detail,
  goalId: handoff.goalId,
  id: handoff.id,
  integrationId: handoff.integrationId,
  plan: handoff.plan,
  projectId: handoff.projectId,
  result: handoff.result,
  status: handoff.status
})

/** The card states every external action verbatim; approval covers exactly this plan. */
export const handoffDecision = (
  handoffId: string,
  goalId: string,
  projectId: string,
  plan: HandoffPlan
): DecisionRequest => ({
  category: "external_side_effect",
  context: [
    `Handoff ${handoffId} will perform exactly these external actions on GitHub repository ${plan.repository}:`,
    `1. Push commit ${plan.headSha} to ${plan.remote} as refs/heads/${plan.branch} (no force push).`,
    `2. Open a pull request from ${plan.branch} into ${plan.baseRef} titled "${plan.title}", or reuse an open one for that branch.`,
    ...(plan.supersedesPullRequest === null
      ? []
      : [`3. Comment on pull request #${plan.supersedesPullRequest} that it is superseded by the new pull request.`]),
    `The pull request body is ${plan.bodyLength} characters with SHA-256 ${plan.bodySha256}; review it with evergreen.handoff.status.`,
    "Nothing is merged. Merging remains the engineer's action on GitHub."
  ].join("\n"),
  goalId,
  idempotencyKey: `handoff-${handoffId}`,
  options: [
    { detail: "Allow exactly the listed push, pull request, and comment actions.", id: handoffApproveOptionId, label: "Push and open PR" },
    { detail: "Do not contact GitHub. A new integration attempt is required to request again.", id: "decline", label: "Decline" }
  ],
  projectId,
  recommendedOptionId: null,
  title: `Push ${plan.branch} and open a pull request into ${plan.baseRef}`
})

export class HandoffCommands {
  readonly #decisions: DecisionRepository
  readonly #events: EventStore
  readonly #handoffs: HandoffRepository
  readonly #integrations: IntegrationRepository
  readonly #outbox: OutboxRepository

  constructor(transaction: SQL) {
    this.#decisions = new DecisionRepository(transaction)
    this.#events = new EventStore(transaction)
    this.#handoffs = new HandoffRepository(transaction)
    this.#integrations = new IntegrationRepository(transaction)
    this.#outbox = new OutboxRepository(transaction)
  }

  async request(input: HandoffRequest): Promise<HandoffRequestResult> {
    const integration = await this.#integrations.findByIdForUpdate(input.integrationId)
    if (integration === undefined) {
      throw new EvidenceNotFoundError(`Integration not found: ${input.integrationId}`)
    }
    const replay = await this.#handoffs.findByIdempotency(integration.projectId, input.idempotencyKey)
    if (replay !== undefined) {
      return { created: false, decisionId: replay.decisionId, handoffId: replay.id, status: replay.status }
    }
    const existing = await this.#handoffs.findByIntegration(integration.id)
    if (existing !== undefined) {
      throw new EvidenceConflictError(`Integration ${integration.id} already has handoff ${existing.id} (${existing.status})`)
    }
    const completion = integration.completion
    if (integration.status !== "validated" || completion === null) {
      throw new EvidenceConflictError(`Only a validated integration can be handed off; integration is ${integration.status}`)
    }
    if (completion.branch !== input.plan.branch || completion.headSha?.toLowerCase() !== input.plan.headSha.toLowerCase()) {
      throw new EvidenceConflictError("Handoff branch and head must equal the validated integration's branch and head")
    }
    if (integration.baseRef !== input.plan.baseRef) {
      throw new EvidenceConflictError("Handoff pull request base must be the goal's base ref")
    }

    const handoffId = crypto.randomUUID()
    const plan: HandoffPlan = {
      ...input.plan,
      bodyLength: input.body.length,
      bodySha256: createHash("sha256").update(input.body).digest("hex")
    }
    const decisionId = crypto.randomUUID()
    const decision = handoffDecision(handoffId, integration.goalId, integration.projectId, plan)
    const correlationId = crypto.randomUUID()
    const decisionEvent = createDecisionRequestedEvent({ actor, correlationId, decision, decisionId, sequence: 1 })
    if (!(await this.#decisions.create({ id: decisionId, request: decision, requestedEventId: decisionEvent.eventId }))) {
      throw new Error(`Handoff decision for ${handoffId} was not created`)
    }
    const record = {
      body: input.body,
      decisionId,
      goalId: integration.goalId,
      id: handoffId,
      idempotencyKey: input.idempotencyKey,
      integrationId: integration.id,
      plan,
      projectId: integration.projectId
    }
    const handoffEvent = createHandoffUpdatedEvent({
      actor,
      causationId: decisionEvent.eventId,
      correlationId,
      handoff: {
        decisionId,
        detail: "",
        goalId: record.goalId,
        id: handoffId,
        integrationId: record.integrationId,
        plan,
        projectId: record.projectId,
        result: null,
        status: "requested"
      },
      sequence: 1
    })
    await this.#handoffs.create({ ...record, lastEventId: handoffEvent.eventId, sequence: 1 })
    await this.publish(decisionEvent)
    await this.publish(handoffEvent)
    return { created: true, decisionId, handoffId, status: "requested" }
  }

  /**
   * Moves an approved handoff to `executing` before any external side effect.
   * A rejected card ends it `declined`; an unresolved card is refused.
   * Re-entering `executing` (recovery) is allowed and reported as `resumed`.
   */
  async begin(handoffId: string): Promise<HandoffBeginResult> {
    const handoff = await this.lock(handoffId)
    if (handoff.status === "completed" || handoff.status === "declined") {
      return { handoffId, resumed: false, status: handoff.status }
    }
    if (handoff.status === "executing") {
      return { handoffId, resumed: true, status: "executing" }
    }
    const decision = await this.#decisions.findById(handoff.decisionId)
    if (decision === undefined) {
      throw new Error(`Handoff ${handoffId} references a missing decision`)
    }
    if (decision.status === "requested") {
      throw new EvidenceConflictError(`Handoff ${handoffId} is awaiting approval of decision ${decision.id}`)
    }
    const approved = decision.status === "approved" && decision.resolution?.selectedOptionId === handoffApproveOptionId
    const status = approved ? "executing" : "declined"
    const detail = approved
      ? handoff.status === "failed"
        ? `Retrying the approved plan after: ${handoff.detail}`.slice(0, 8_000)
        : "Approved; executing the recorded plan."
      : `Decision ${decision.id} did not approve the handoff.`
    await this.transition(handoff, status, detail, null, decision.resolvedEventId ?? handoff.lastEventId)
    return { handoffId, resumed: false, status }
  }

  async complete(handoffId: string, completion: HandoffCompletion): Promise<HandoffCompletionResult> {
    const handoff = await this.lock(handoffId)
    if (handoff.status === completion.status) {
      return { completed: false, handoffId, status: handoff.status }
    }
    if (handoff.status !== "executing") {
      throw new EvidenceConflictError(`Handoff ${handoffId} is ${handoff.status}, not executing`)
    }
    if (completion.status === "completed" && completion.result.pushedSha.toLowerCase() !== handoff.plan.headSha.toLowerCase()) {
      throw new EvidenceConflictError("Handoff pushed a commit other than the approved head")
    }
    await this.transition(
      handoff,
      completion.status,
      completion.detail,
      completion.status === "completed" ? completion.result : null,
      handoff.lastEventId
    )
    return { completed: true, handoffId, status: completion.status }
  }

  private async transition(
    handoff: HandoffRecord,
    status: HandoffRecord["status"],
    detail: string,
    result: HandoffRecord["result"],
    causationId: string
  ): Promise<void> {
    const sequence = handoff.sequence + 1
    const event = createHandoffUpdatedEvent({
      actor,
      causationId,
      correlationId: crypto.randomUUID(),
      handoff: payload({ ...handoff, detail, result, status }),
      sequence
    })
    await this.#handoffs.update(handoff.id, { detail, eventId: event.eventId, result, sequence, status })
    await this.publish(event)
  }

  private async lock(handoffId: string): Promise<HandoffRecord> {
    const handoff = await this.#handoffs.findByIdForUpdate(handoffId)
    if (handoff === undefined) {
      throw new EvidenceNotFoundError(`Handoff not found: ${handoffId}`)
    }
    return handoff
  }

  private async publish(event: EventEnvelope): Promise<void> {
    await this.#events.append(event)
    await this.#outbox.enqueue(event)
  }
}
