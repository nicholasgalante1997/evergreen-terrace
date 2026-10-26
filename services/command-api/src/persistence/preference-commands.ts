/** @module Learned-preference command transactions: automatic low-impact promotion, otherwise a decision card. */

import { createPreferenceUpdatedEvent, preferencePromotionRoute } from "@evergreen-terrace/contracts"
import type { DecisionRequest, EventEnvelope, PreferenceProposal } from "@evergreen-terrace/contracts"
import type { SQL } from "bun"
import { boundedContext, createDecisionCard } from "./decision-card"
import { DecisionRepository } from "./decision-repository"
import type { DecisionRecord } from "./decision-repository.types"
import { EventStore } from "./event-store"
import { OutboxRepository } from "./outbox-repository"
import { PreferenceRepository } from "./preference-repository"
import type { PreferenceProposalResult } from "./command-database.types"
import type { PreferenceRecord } from "./preference-repository.types"

const actor = { id: "command-api", kind: "system" } as const

export const preferencePromoteOptionId = "promote"

type PreferenceState = Omit<PreferenceRecord, "createdAt" | "idempotencyKey" | "lastEventId" | "updatedAt">

const payload = (preference: PreferenceState) => ({
  category: preference.category,
  decisionId: preference.decisionId,
  detail: preference.detail,
  evidence: preference.evidence,
  id: preference.id,
  key: preference.key,
  projectId: preference.projectId,
  rationale: preference.rationale,
  scope: preference.scope,
  status: preference.status,
  supersededBy: preference.supersededBy,
  value: preference.value
})

const preferenceDecision = (
  preferenceId: string,
  proposal: PreferenceProposal,
  current: PreferenceRecord | undefined,
  reason: string
): DecisionRequest => ({
  category: "preference",
  context: boundedContext(
    [
      `Preference ${preferenceId} would be learned into the ${proposal.scope === "global" ? "global profile" : `profile for ${proposal.projectId}`}.`,
      `Key: ${proposal.key} (${proposal.category})`,
      `Value: ${proposal.value}`,
      ...(current === undefined ? [] : [`It replaces the current value: ${current.value}`]),
      "",
      `It needs a decision because ${reason}.`,
      "",
      "Rationale:",
      proposal.rationale,
      "",
      "Evidence:",
      ...proposal.evidence.map((entry) => `- ${entry}`),
      "",
      "A preference shapes agent prompts only. It can never weaken .et policy or the engine safety floor."
    ],
    "Read the preference with evergreen.preference.list."
  ),
  goalId: null,
  idempotencyKey: `preference-${preferenceId}`,
  options: [
    { detail: "Add this preference to the profile.", id: preferencePromoteOptionId, label: "Learn it" },
    { detail: "Do not learn this preference.", id: "reject", label: "Reject" }
  ],
  projectId: proposal.projectId ?? "global",
  recommendedOptionId: null,
  title: `Learn ${proposal.key} = ${proposal.value}`.slice(0, 240)
})

export class PreferenceCommands {
  readonly #decisions: DecisionRepository
  readonly #events: EventStore
  readonly #outbox: OutboxRepository
  readonly #preferences: PreferenceRepository

  constructor(transaction: SQL) {
    this.#decisions = new DecisionRepository(transaction)
    this.#events = new EventStore(transaction)
    this.#outbox = new OutboxRepository(transaction)
    this.#preferences = new PreferenceRepository(transaction)
  }

  async propose(proposal: PreferenceProposal): Promise<PreferenceProposalResult> {
    const replay = await this.#preferences.findByIdempotency(proposal.projectId, proposal.idempotencyKey)
    if (replay !== undefined) {
      return {
        created: false,
        decisionId: replay.decisionId,
        preferenceId: replay.id,
        route: replay.decisionId === null ? "automatic" : "decision",
        status: replay.status
      }
    }
    await this.#preferences.lockKey(proposal.scope, proposal.projectId, proposal.key)
    const current = await this.#preferences.findPromoted(proposal.scope, proposal.projectId, proposal.key)
    const route = preferencePromotionRoute(proposal, current ?? null)
    const preferenceId = crypto.randomUUID()
    const correlationId = crypto.randomUUID()
    const base = {
      category: proposal.category,
      evidence: proposal.evidence,
      id: preferenceId,
      idempotencyKey: proposal.idempotencyKey,
      key: proposal.key,
      projectId: proposal.projectId,
      rationale: proposal.rationale,
      scope: proposal.scope,
      sequence: 1,
      supersededBy: null,
      value: proposal.value
    }

    if (route.route === "automatic") {
      const record = {
        ...base,
        decisionId: null,
        detail: `Promoted automatically: ${route.reason}.`,
        status: "promoted" as const
      }
      const event = this.event(record, null, correlationId)
      // At most one promoted row per key: retire the current one first.
      if (current !== undefined) {
        await this.supersede(current, preferenceId, event.eventId)
      }
      await this.#preferences.create({ ...record, lastEventId: event.eventId })
      await this.publish(event)
      return { created: true, decisionId: null, preferenceId, route: "automatic", status: "promoted" }
    }

    const card = await createDecisionCard(
      this.#decisions,
      preferenceDecision(preferenceId, proposal, current, route.reason),
      correlationId
    )
    const record = {
      ...base,
      decisionId: card.decisionId,
      detail: `Awaiting a decision: ${route.reason}.`,
      status: "proposed" as const
    }
    const event = this.event(record, card.event.eventId, correlationId)
    await this.#preferences.create({ ...record, lastEventId: event.eventId })
    await this.publish(card.event)
    await this.publish(event)
    return { created: true, decisionId: card.decisionId, preferenceId, route: "decision", status: "proposed" }
  }

  /** Runs inside the decision-resolution transaction, so a card and its preference settle together. */
  async settle(decision: DecisionRecord): Promise<void> {
    const preference = await this.#preferences.findByDecisionForUpdate(decision.id)
    if (preference === undefined || preference.status !== "proposed" || decision.resolvedEventId === null) {
      return
    }
    const promoted = decision.status === "approved" && decision.resolution?.selectedOptionId === preferencePromoteOptionId
    if (!promoted) {
      await this.transition(
        preference,
        "rejected",
        `Decision ${decision.id} did not approve it.`,
        null,
        decision.resolvedEventId
      )
      return
    }
    await this.#preferences.lockKey(preference.scope, preference.projectId, preference.key)
    const current = await this.#preferences.findPromoted(preference.scope, preference.projectId, preference.key)
    if (current !== undefined) {
      await this.supersede(current, preference.id, decision.resolvedEventId)
    }
    await this.transition(preference, "promoted", `Promoted by decision ${decision.id}.`, null, decision.resolvedEventId)
  }

  private async supersede(current: PreferenceRecord, supersededBy: string, causationId: string): Promise<void> {
    await this.transition(current, "superseded", `Superseded by preference ${supersededBy}.`, supersededBy, causationId)
  }

  private async transition(
    preference: PreferenceRecord,
    status: PreferenceRecord["status"],
    detail: string,
    supersededBy: string | null,
    causationId: string
  ): Promise<void> {
    const sequence = preference.sequence + 1
    const event = this.event({ ...preference, detail, sequence, status, supersededBy }, causationId, crypto.randomUUID())
    await this.#preferences.update(preference.id, { detail, eventId: event.eventId, sequence, status, supersededBy })
    await this.publish(event)
  }

  private event(preference: PreferenceState, causationId: string | null, correlationId: string): EventEnvelope {
    return createPreferenceUpdatedEvent({
      actor,
      causationId,
      correlationId,
      preference: payload(preference),
      sequence: preference.sequence
    })
  }

  private async publish(event: EventEnvelope): Promise<void> {
    await this.#events.append(event)
    await this.#outbox.enqueue(event)
  }
}
