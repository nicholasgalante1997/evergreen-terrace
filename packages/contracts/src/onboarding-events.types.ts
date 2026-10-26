/** @module Repository-onboarding types inferred from strict Zod schemas. */

import type { z } from "zod"
import type { actorSchema } from "./events"
import type {
  discoveryAreaSchema,
  discoveryCitationSchema,
  discoveryFindingSchema,
  discoveryReportSchema,
  onboardingApplyCompletionSchema,
  onboardingDiscoveryCompletionSchema,
  onboardingDiscoverySessionSchema,
  onboardingFactsSchema,
  onboardingPacketSchema,
  onboardingProposalSchema,
  onboardingResultSchema,
  onboardingStartSchema,
  onboardingStatusSchema,
  onboardingUpdatedPayloadSchema,
  verifiedDiscoveryReportSchema
} from "./onboarding-events"

export type DiscoveryArea = z.infer<typeof discoveryAreaSchema>
export type DiscoveryCitation = z.infer<typeof discoveryCitationSchema>
export type DiscoveryFinding = z.infer<typeof discoveryFindingSchema>
export type DiscoveryReport = z.infer<typeof discoveryReportSchema>
export type VerifiedDiscoveryReport = z.infer<typeof verifiedDiscoveryReportSchema>
export type OnboardingFacts = z.infer<typeof onboardingFactsSchema>
export type OnboardingProposal = z.infer<typeof onboardingProposalSchema>
export type OnboardingPacket = z.infer<typeof onboardingPacketSchema>
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>
export type OnboardingDiscoverySession = z.infer<typeof onboardingDiscoverySessionSchema>
export type OnboardingStart = z.infer<typeof onboardingStartSchema>
export type OnboardingDiscoveryCompletion = z.infer<typeof onboardingDiscoveryCompletionSchema>
export type OnboardingResult = z.infer<typeof onboardingResultSchema>
export type OnboardingApplyCompletion = z.infer<typeof onboardingApplyCompletionSchema>
export type OnboardingUpdatedPayload = z.infer<typeof onboardingUpdatedPayloadSchema>
/** Caller-facing shapes: defaulted fields are optional and filled when the schema parses. */
export type OnboardingStartInput = z.input<typeof onboardingStartSchema>
export type OnboardingDiscoveryCompletionInput = z.input<typeof onboardingDiscoveryCompletionSchema>
export type OnboardingApplyCompletionInput = z.input<typeof onboardingApplyCompletionSchema>

export interface OnboardingUpdatedEventInput {
  actor: z.infer<typeof actorSchema>
  causationId: string | null
  correlationId: string
  onboarding: OnboardingUpdatedPayload["onboarding"]
  sequence: number
}
