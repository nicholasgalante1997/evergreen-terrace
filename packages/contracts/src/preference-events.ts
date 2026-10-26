/** @module Learned-preference contracts and the conservative promotion rules. */

import { z } from "zod"
import { eventEnvelopeSchema } from "./events"
import type { EventEnvelope } from "./events.types"
import type { PreferencePromotionRoute, PreferenceProposal, PreferenceUpdatedEventInput } from "./preference-events.types"

/**
 * What the profile may learn. Technical guardrails and `.et` policy are not
 * here: they change only through a factory branch and review, never by learning.
 */
export const preferenceCategorySchema = z.enum([
  "tone",
  "verbosity",
  "runner",
  "workflow",
  "language_convention",
  "framework_convention"
])

/** Categories that shape only how the factory communicates or runs, not what code it writes. */
export const lowImpactPreferenceCategories = ["tone", "verbosity", "runner", "workflow"] as const

/** Key prefixes that name policy. A preference can never shadow them. */
export const policyPreferenceKeyPrefixes = [
  "policy",
  "permissions",
  "risk",
  "validation",
  "branches",
  "workers",
  "goals"
] as const

/** Low-impact preferences promote automatically only with at least this much independent evidence. */
export const automaticPromotionEvidence = 2

export const preferenceKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){0,3}$/)
  .max(96)
  .refine((key) => !(policyPreferenceKeyPrefixes as readonly string[]).includes(key.split(".")[0] ?? ""), {
    message: "policy is changed through .et on a factory branch, never learned"
  })

export const preferenceProposalSchema = z
  .object({
    category: preferenceCategorySchema,
    /** Durable references: event IDs, artifact paths, PR URLs. */
    evidence: z.array(z.string().min(1).max(2_048)).min(1).max(8),
    idempotencyKey: z.string().min(1).max(128),
    key: preferenceKeySchema,
    projectId: z.string().min(1).max(256).nullable(),
    rationale: z.string().min(1).max(4_000),
    scope: z.enum(["global", "project"]),
    value: z.string().min(1).max(2_000)
  })
  .strict()
  .refine((proposal) => (proposal.scope === "project") === (proposal.projectId !== null), {
    message: "a project preference names its project; a global one does not",
    path: ["projectId"]
  })
  .refine((proposal) => new Set(proposal.evidence).size === proposal.evidence.length, {
    message: "evidence entries must be distinct",
    path: ["evidence"]
  })

export const preferenceStatusSchema = z.enum(["proposed", "promoted", "rejected", "superseded"])

/**
 * The learning rule. A proposal promotes without a decision card only when it
 * is low impact, has independent evidence, and does not change a preference
 * the engineer already holds. Everything dependent or material is a card.
 */
export const preferencePromotionRoute = (
  proposal: Pick<PreferenceProposal, "category" | "evidence" | "value">,
  current: { value: string } | null
): PreferencePromotionRoute => {
  if (!(lowImpactPreferenceCategories as readonly string[]).includes(proposal.category)) {
    return { reason: `${proposal.category} changes the code the factory writes`, route: "decision" }
  }
  if (current !== null && current.value !== proposal.value) {
    return { reason: "it changes a preference already in the profile", route: "decision" }
  }
  if (proposal.evidence.length < automaticPromotionEvidence) {
    return { reason: `it cites fewer than ${automaticPromotionEvidence} pieces of evidence`, route: "decision" }
  }
  return { reason: "low impact, with independent evidence", route: "automatic" }
}

export const preferenceUpdatedPayloadSchema = z
  .object({
    preference: z
      .object({
        category: preferenceCategorySchema,
        decisionId: z.string().uuid().nullable(),
        detail: z.string().max(4_000),
        evidence: z.array(z.string().min(1).max(2_048)).min(1).max(8),
        id: z.string().uuid(),
        key: preferenceKeySchema,
        projectId: z.string().min(1).max(256).nullable(),
        rationale: z.string().min(1).max(4_000),
        scope: z.enum(["global", "project"]),
        status: preferenceStatusSchema,
        supersededBy: z.string().uuid().nullable(),
        value: z.string().min(1).max(2_000)
      })
      .strict()
  })
  .strict()

export const createPreferenceUpdatedEvent = (input: PreferenceUpdatedEventInput): EventEnvelope =>
  eventEnvelopeSchema.parse({
    actor: input.actor,
    aggregate: { id: input.preference.id, sequence: input.sequence, type: "preference" },
    causationId: input.causationId,
    correlationId: input.correlationId,
    eventId: crypto.randomUUID(),
    eventType: "preference.updated",
    occurredAt: new Date().toISOString(),
    payload: preferenceUpdatedPayloadSchema.parse({ preference: input.preference }),
    schemaVersion: 1
  })
