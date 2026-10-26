/** @module Command API client result contracts. */

import type {
  HandoffPlan,
  HandoffResult,
  HandoffStatus,
  IntegrationCompletion,
  OnboardingStatus,
  PlanStatus,
  PreferenceStatus
} from "@evergreen-terrace/contracts"
import type { z } from "zod"
import type {
  commandOnboardingSnapshotSchema,
  commandPlanSnapshotSchema,
  commandPreferenceSnapshotSchema
} from "./command-snapshots"

export interface CommandGoalResult {
  created: boolean
  eventId: string
  goalId: string
}

export interface CommandDecisionRequestResult {
  created: boolean
  decisionId: string
  eventId: string
  status: "requested"
}

export interface CommandDecisionResolutionResult {
  decisionId: string
  eventId: string
  resolved: boolean
  status: "approved" | "rejected"
}

export interface CommandWorkerAssignmentResult {
  created: boolean
  eventId: string
  state: "assigned"
  workerId: string
}

export interface CommandWorkerStateChangeResult {
  eventId: string
  state: "running" | "awaiting_decision" | "completed" | "failed" | "cancelled"
  transitioned: boolean
  workerId: string
}

export interface CommandDecisionSnapshot {
  id: string
  options: Array<{ id: string; label: string }>
  resolution: { note: string; selectedOptionId: string | null; status: "approved" | "rejected" } | null
  status: "requested" | "approved" | "rejected"
  title: string
}

export interface CommandGoalSnapshot {
  baseRef: string
  baseSha: string
  /** The goal contract the mayor plans from; empty for an older goal without stored detail. */
  constraints: string[]
  description: string
  id: string
  priorityClass: string
  projectId: string
  references: string[]
  title: string
}

export type CommandPlanSnapshot = z.infer<typeof commandPlanSnapshotSchema>
export type CommandOnboardingSnapshot = z.infer<typeof commandOnboardingSnapshotSchema>
export type CommandPreferenceSnapshot = z.infer<typeof commandPreferenceSnapshotSchema>

export interface CommandPlanResult {
  created: boolean
  decisionId?: string
  planId: string
  revision: number
  status: PlanStatus
}

export interface CommandPlanBeginLaunchResult {
  planId: string
  resumed: boolean
  status: PlanStatus
}

export interface CommandOnboardingResult {
  created: boolean
  decisionId?: string
  onboardingId: string
  revision: number
  status: OnboardingStatus
}

export interface CommandOnboardingBeginApplyResult {
  onboardingId: string
  resumed: boolean
  status: OnboardingStatus
}

export interface CommandPreferenceResult {
  created: boolean
  decisionId: string | null
  preferenceId: string
  route: "automatic" | "decision"
  status: PreferenceStatus
}

export interface CommandIntegrationSnapshot {
  attempt: number
  baseRef: string
  baseSha: string
  completion: IntegrationCompletion | null
  goalId: string
  id: string
  projectId: string
  status: string
}

export interface CommandHandoffSnapshot {
  body: string
  decisionId: string
  detail: string
  goalId: string
  id: string
  integrationId: string
  plan: HandoffPlan
  projectId: string
  result: HandoffResult | null
  status: HandoffStatus
}

export interface CommandHandoffRequestResult {
  created: boolean
  decisionId: string
  handoffId: string
  status: HandoffStatus
}

export interface CommandHandoffBeginResult {
  handoffId: string
  resumed: boolean
  status: HandoffStatus
}

export interface CommandValidationResult {
  created: boolean
  status: "passed" | "failed"
  validationId: string
}

export interface CommandIntegrationStartResult {
  attempt: number
  created: boolean
  integrationId: string
  status: string
}

export interface CommandIntegrationCompletionResult {
  completed: boolean
  integrationId: string
  status: string
}

export interface CommandWorkerBriefResult {
  briefSha256: string
  eventId: string
  recorded: boolean
  workerId: string
}

export interface CommandWorkerBrief {
  prompt: string
  sha256: string
  workerId: string
}

export interface CommandWorkerLeaseResult {
  changed: boolean
  leaseExpiresAt: string
  leaseOwner: string
  workerId: string
}

export interface CommandWorkerLeaseReconcileResult {
  reconciled: boolean
  state: CommandWorkerSnapshot["state"]
  workerId: string
}

export interface CommandWorkerSnapshot {
  adapter: "claude" | "codex"
  briefSha256: string | null
  dependsOnWorkerIds: string[]
  goalId: string
  id: string
  idempotencyKey: string
  leaseExpiresAt: string | null
  leaseOwner: string | null
  projectId: string
  role: string
  state: "assigned" | "running" | "awaiting_decision" | "completed" | "failed" | "cancelled"
  worktree: {
    artifactDirectory: string
    attempt: number
    baseRef: string
    baseSha: string
    branch: string
    manifestPath: string
    worktreePath: string
  }
}
