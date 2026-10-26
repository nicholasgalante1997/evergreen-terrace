/** @module Mayor goal-plan types inferred from strict Zod schemas. */

import type { z } from "zod"
import type { actorSchema } from "./events"
import type {
  mayorPlanSchema,
  mayorTaskSchema,
  planDraftCompletionSchema,
  planDraftStartSchema,
  planLaunchCompletionSchema,
  planMayorSessionSchema,
  planOverlapSchema,
  planProposalSummarySchema,
  planQuestionSchema,
  planRiskSchema,
  planStatusSchema,
  planTaskSummarySchema,
  planUpdatedPayloadSchema,
  riskCategorySchema
} from "./plan-events"

export type RiskCategory = z.infer<typeof riskCategorySchema>
export type MayorTask = z.infer<typeof mayorTaskSchema>
export type MayorPlan = z.infer<typeof mayorPlanSchema>
export type PlanQuestion = z.infer<typeof planQuestionSchema>
export type PlanRisk = z.infer<typeof planRiskSchema>
export type PlanTaskSummary = z.infer<typeof planTaskSummarySchema>
export type PlanProposalSummary = z.infer<typeof planProposalSummarySchema>
export type PlanOverlap = z.infer<typeof planOverlapSchema>
export type PlanStatus = z.infer<typeof planStatusSchema>
export type PlanMayorSession = z.infer<typeof planMayorSessionSchema>
export type PlanDraftStart = z.infer<typeof planDraftStartSchema>
export type PlanDraftCompletion = z.infer<typeof planDraftCompletionSchema>
export type PlanLaunchCompletion = z.infer<typeof planLaunchCompletionSchema>
export type PlanUpdatedPayload = z.infer<typeof planUpdatedPayloadSchema>
/** Caller-facing shapes: defaulted fields are optional and filled when the schema parses. */
export type PlanDraftStartInput = z.input<typeof planDraftStartSchema>
export type PlanDraftCompletionInput = z.input<typeof planDraftCompletionSchema>

export interface PlanUpdatedEventInput {
  actor: z.infer<typeof actorSchema>
  causationId: string | null
  correlationId: string
  plan: PlanUpdatedPayload["plan"]
  sequence: number
}
