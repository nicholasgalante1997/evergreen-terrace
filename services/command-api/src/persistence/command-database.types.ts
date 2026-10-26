/** @module Command database result types. */

import type {
  HandoffStatus,
  OnboardingStatus,
  PlanStatus,
  PreferenceStatus,
  WorkerState
} from "@evergreen-terrace/contracts"
import type { IntegrationStatus } from "./evidence-repository.types"

export interface HandoffRequestResult {
  created: boolean
  decisionId: string
  handoffId: string
  status: HandoffStatus
}

export interface HandoffBeginResult {
  handoffId: string
  resumed: boolean
  status: HandoffStatus
}

export interface HandoffCompletionResult {
  completed: boolean
  handoffId: string
  status: HandoffStatus
}

export interface ValidationRecordResult {
  created: boolean
  eventId: string
  status: "passed" | "failed"
  validationId: string
}

export interface IntegrationStartResult {
  attempt: number
  created: boolean
  eventId: string
  integrationId: string
  status: IntegrationStatus
}

export interface IntegrationCompletionResult {
  completed: boolean
  eventId: string
  integrationId: string
  status: IntegrationStatus
}

export interface WorkerBriefResult {
  briefSha256: string
  eventId: string
  recorded: boolean
  workerId: string
}

export interface WorkerLeaseResult {
  changed: boolean
  eventId: string | null
  leaseExpiresAt: string
  leaseOwner: string
  workerId: string
}

export interface WorkerLeaseReleaseResult {
  eventId: string | null
  released: boolean
  state: WorkerState
  workerId: string
}

export interface WorkerLeaseReconcileResult {
  eventIds: string[]
  reconciled: boolean
  state: WorkerState
  workerId: string
}

export interface GoalSubmissionResult {
  created: boolean
  eventId: string
  goalId: string
}

export interface DecisionRequestResult {
  created: boolean
  decisionId: string
  eventId: string
  status: "requested"
}

export interface DecisionResolutionResult {
  decisionId: string
  eventId: string
  resolved: boolean
  status: "approved" | "rejected"
}

export interface WorkerAssignmentResult {
  created: boolean
  eventId: string
  state: "assigned"
  workerId: string
}

export interface WorkerStateChangeResult {
  eventId: string
  state: "running" | "awaiting_decision" | "completed" | "failed" | "cancelled"
  transitioned: boolean
  workerId: string
}

export interface PlanCommandResult {
  created: boolean
  decisionId?: string
  planId: string
  revision: number
  status: PlanStatus
}

export interface PlanBeginLaunchResult {
  planId: string
  resumed: boolean
  status: PlanStatus
}

export interface OnboardingCommandResult {
  created: boolean
  decisionId?: string
  onboardingId: string
  revision: number
  status: OnboardingStatus
}

export interface OnboardingBeginApplyResult {
  onboardingId: string
  resumed: boolean
  status: OnboardingStatus
}

export interface PreferenceProposalResult {
  created: boolean
  decisionId: string | null
  preferenceId: string
  route: "automatic" | "decision"
  status: PreferenceStatus
}
