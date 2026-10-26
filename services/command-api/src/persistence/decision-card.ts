/** @module Atomic creation of a decision card from inside another aggregate's command transaction. */

import { createDecisionRequestedEvent } from "@evergreen-terrace/contracts"
import type { DecisionRequest, EventEnvelope } from "@evergreen-terrace/contracts"
import type { DecisionRepository } from "./decision-repository"

const actor = { id: "command-api", kind: "system" } as const

/** Writes the card row and returns its `decision.requested` event for the caller to publish in the same transaction. */
export const createDecisionCard = async (
  decisions: DecisionRepository,
  decision: DecisionRequest,
  correlationId: string
): Promise<{ decisionId: string; event: EventEnvelope }> => {
  const decisionId = crypto.randomUUID()
  const event = createDecisionRequestedEvent({ actor, correlationId, decision, decisionId, sequence: 1 })
  if (!(await decisions.create({ id: decisionId, request: decision, requestedEventId: event.eventId }))) {
    throw new Error(`Decision card ${decision.idempotencyKey} already exists`)
  }
  return { decisionId, event }
}

/** Card context is bounded; long evidence is cut with a pointer to the full record. */
export const boundedContext = (lines: readonly string[], pointer: string): string => {
  const text = lines.join("\n")
  const limit = 20_000
  if (text.length <= limit) {
    return text
  }
  const suffix = `\n… truncated. ${pointer}`
  return `${text.slice(0, limit - suffix.length)}${suffix}`
}
