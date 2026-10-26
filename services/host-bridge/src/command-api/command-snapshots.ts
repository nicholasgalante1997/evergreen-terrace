/** @module Strict parsers for command-side plan, onboarding, and preference snapshots. */

import {
  mayorPlanSchema,
  onboardingDiscoverySessionSchema,
  onboardingPacketSchema,
  onboardingResultSchema,
  onboardingStatusSchema,
  planLaunchCompletionSchema,
  planMayorSessionSchema,
  planOverlapSchema,
  planStatusSchema,
  preferenceCategorySchema,
  preferenceStatusSchema,
  riskCategorySchema
} from "@evergreen-terrace/contracts"
import { z } from "zod"

/** Command responses carry bookkeeping fields too; only these are read, so additions do not break the bridge. */
export const commandPlanSnapshotSchema = z.object({
  decisionId: z.string().uuid().nullable(),
  detail: z.string(),
  feedback: z.string(),
  flaggedRisks: z.array(riskCategorySchema),
  goalId: z.string().uuid(),
  id: z.string().uuid(),
  launch: planLaunchCompletionSchema.nullable(),
  mayor: planMayorSessionSchema,
  overlaps: z.array(planOverlapSchema),
  projectId: z.string(),
  proposal: mayorPlanSchema.nullable(),
  questionDecisionIds: z.array(z.string().uuid()),
  revision: z.number().int(),
  revisionOf: z.string().uuid().nullable(),
  status: planStatusSchema
})

export const commandOnboardingSnapshotSchema = z.object({
  decisionId: z.string().uuid().nullable(),
  detail: z.string(),
  discovery: onboardingDiscoverySessionSchema,
  feedback: z.string(),
  id: z.string().uuid(),
  packet: onboardingPacketSchema.nullable(),
  projectId: z.string(),
  result: onboardingResultSchema.nullable(),
  revision: z.number().int(),
  revisionOf: z.string().uuid().nullable(),
  status: onboardingStatusSchema
})

export const commandPreferenceSnapshotSchema = z.object({
  category: preferenceCategorySchema,
  decisionId: z.string().uuid().nullable(),
  detail: z.string(),
  evidence: z.array(z.string()),
  id: z.string().uuid(),
  key: z.string(),
  projectId: z.string().nullable(),
  rationale: z.string(),
  scope: z.enum(["global", "project"]),
  status: preferenceStatusSchema,
  supersededBy: z.string().uuid().nullable(),
  value: z.string()
})
