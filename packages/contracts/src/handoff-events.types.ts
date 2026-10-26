/** @module GitHub handoff types inferred from strict Zod schemas. */

import type { z } from "zod"
import type { actorSchema } from "./events"
import type {
  handoffCompletionSchema,
  handoffPlanSchema,
  handoffRequestSchema,
  handoffResultSchema,
  handoffStatusSchema,
  handoffUpdatedPayloadSchema
} from "./handoff-events"

export type HandoffPlan = z.infer<typeof handoffPlanSchema>
export type HandoffRequest = z.infer<typeof handoffRequestSchema>
export type HandoffResult = z.infer<typeof handoffResultSchema>
export type HandoffStatus = z.infer<typeof handoffStatusSchema>
export type HandoffCompletion = z.infer<typeof handoffCompletionSchema>
export type HandoffUpdatedPayload = z.infer<typeof handoffUpdatedPayloadSchema>

export interface HandoffUpdatedEventInput {
  actor: z.infer<typeof actorSchema>
  causationId: string | null
  correlationId: string
  handoff: HandoffUpdatedPayload["handoff"]
  sequence: number
}
