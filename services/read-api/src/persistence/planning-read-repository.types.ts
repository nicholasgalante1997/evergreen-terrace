/** @module Read-model plan, onboarding, and preference contracts. */

import type { OnboardingUpdatedPayload, PlanUpdatedPayload, PreferenceUpdatedPayload } from "@evergreen-terrace/contracts"

interface ReadFreshness {
  lastEventId: string
  updatedAt: Date
}

export type ReadPlan = PlanUpdatedPayload["plan"] & ReadFreshness
export type ReadOnboarding = OnboardingUpdatedPayload["onboarding"] & ReadFreshness
export type ReadPreference = PreferenceUpdatedPayload["preference"] & ReadFreshness
