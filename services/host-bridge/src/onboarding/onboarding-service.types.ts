/** @module Onboarding service ports and results. */

import type { OnboardingFacts, OnboardingResult, OnboardingStatus, WorkerAdapter } from "@evergreen-terrace/contracts"
import type { ProjectPolicy } from "@evergreen-terrace/project-policy"
import type { CommandApiClient } from "../command-api/command-api-client"
import type { ReadOnlyAgentPort, ReadOnlyCheckout } from "../planning/read-only-agent.types"
import type { ValidationCommandRunner } from "../validation/validation.types"

export interface OnboardingServicePorts {
  agent: ReadOnlyAgentPort
  checkouts: {
    create(input: {
      baseSha: string
      key: string
      ownerId: string
      projectId: string
      purpose: "onboarding"
    }): Promise<ReadOnlyCheckout>
  }
  commandApi: Pick<
    CommandApiClient,
    | "beginOnboardingApply"
    | "completeOnboardingApply"
    | "completeOnboardingDiscovery"
    | "getDecision"
    | "getOnboarding"
    | "listProjectOnboardings"
    | "startOnboarding"
  >
  /** The policy committed at a commit, or null. */
  committedPolicy(commitSha: string): Promise<ProjectPolicy | null>
  factoryRoot: string
  facts: {
    collect(input: { baseRef?: string; remote: string }): Promise<{ facts: OnboardingFacts; trackedFiles: string[] }>
    lineCount(commitSha: string, path: string): Promise<number | null>
  }
  projectRoot: string
  validation: ValidationCommandRunner
}

export interface OnboardingDiscoverInput {
  adapter: WorkerAdapter
  baseRef?: string
  feedback?: string
  idempotencyKey?: string
  remote: string
  workers: 2 | 3 | 4
}

export interface OnboardingDiscoverOutcome {
  decisionId: string | null
  detail: string
  onboardingId: string
  status: OnboardingStatus
}

export interface OnboardingDiscoverStarted {
  completion: Promise<OnboardingDiscoverOutcome>
  onboardingId: string
  projectId: string
  revision: number
}

export type OnboardingApplyOutcome =
  | { detail: string; onboardingId: string; status: "declined" | "failed" }
  | { detail: string; onboardingId: string; result: OnboardingResult; status: "applied" }
