/** @module Repository-onboarding persistence contracts. */

import type {
  OnboardingDiscoverySession,
  OnboardingPacket,
  OnboardingResult,
  OnboardingStatus
} from "@evergreen-terrace/contracts"

export interface OnboardingRecord {
  createdAt: Date
  decisionId: string | null
  detail: string
  discovery: OnboardingDiscoverySession
  feedback: string
  id: string
  idempotencyKey: string
  lastEventId: string
  packet: OnboardingPacket | null
  projectId: string
  result: OnboardingResult | null
  revision: number
  revisionOf: string | null
  sequence: number
  status: OnboardingStatus
  updatedAt: Date
}

export interface OnboardingChange {
  decisionId: string | null
  detail: string
  eventId: string
  packet: OnboardingPacket | null
  result: OnboardingResult | null
  sequence: number
  status: OnboardingStatus
}
