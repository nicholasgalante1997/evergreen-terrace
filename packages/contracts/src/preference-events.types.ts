/** @module Learned-preference types inferred from strict Zod schemas. */

import type { z } from "zod"
import type { actorSchema } from "./events"
import type {
  preferenceCategorySchema,
  preferenceProposalSchema,
  preferenceStatusSchema,
  preferenceUpdatedPayloadSchema
} from "./preference-events"

export type PreferenceCategory = z.infer<typeof preferenceCategorySchema>
export type PreferenceProposal = z.infer<typeof preferenceProposalSchema>
export type PreferenceStatus = z.infer<typeof preferenceStatusSchema>
export type PreferenceUpdatedPayload = z.infer<typeof preferenceUpdatedPayloadSchema>

export interface PreferencePromotionRoute {
  reason: string
  route: "automatic" | "decision"
}

export interface PreferenceUpdatedEventInput {
  actor: z.infer<typeof actorSchema>
  causationId: string | null
  correlationId: string
  preference: PreferenceUpdatedPayload["preference"]
  sequence: number
}
