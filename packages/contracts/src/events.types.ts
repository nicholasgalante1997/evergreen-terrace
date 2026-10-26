/** @module Event contract types inferred from strict Zod schemas. */

import type { z } from "zod"
import type {
  actorSchema,
  decisionRequestSchema,
  decisionOptionSchema,
  decisionRequestedPayloadSchema,
  decisionResolvedPayloadSchema,
  decisionResolutionSchema,
  decisionStatusSchema,
  eventEnvelopeSchema,
  goalSubmittedPayloadSchema,
  goalSubmissionSchema,
  workerAdapterSchema,
  workerAssignedPayloadSchema,
  workerAssignmentSchema,
  workerBriefRecordedPayloadSchema,
  workerBriefSchema,
  workerLeaseAcquireSchema,
  workerLeaseAcquiredPayloadSchema,
  workerLeaseExpiredPayloadSchema,
  workerLeaseReconcileSchema,
  workerLeaseReleaseSchema,
  workerLeaseReleasedPayloadSchema,
  workerLeaseRenewSchema,
  workerStateChangeSchema,
  workerStateChangedPayloadSchema,
  workerStateSchema,
  workerWorktreeSchema
} from "./events"

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>
export type GoalSubmission = z.infer<typeof goalSubmissionSchema>
export type GoalSubmittedPayload = z.infer<typeof goalSubmittedPayloadSchema>
export type DecisionRequest = z.infer<typeof decisionRequestSchema>
export type DecisionOption = z.infer<typeof decisionOptionSchema>
export type DecisionResolution = z.infer<typeof decisionResolutionSchema>
export type DecisionStatus = z.infer<typeof decisionStatusSchema>
export type WorkerAdapter = z.infer<typeof workerAdapterSchema>
export type WorkerAssignment = z.infer<typeof workerAssignmentSchema>
export type WorkerState = z.infer<typeof workerStateSchema>
export type WorkerStateChange = z.infer<typeof workerStateChangeSchema>
export type WorkerAssignedPayload = z.infer<typeof workerAssignedPayloadSchema>
export type WorkerStateChangedPayload = z.infer<typeof workerStateChangedPayloadSchema>
export type WorkerWorktree = z.infer<typeof workerWorktreeSchema>
export type WorkerBrief = z.infer<typeof workerBriefSchema>
export type WorkerBriefRecordedPayload = z.infer<typeof workerBriefRecordedPayloadSchema>
export type WorkerLeaseAcquire = z.infer<typeof workerLeaseAcquireSchema>
export type WorkerLeaseRenew = z.infer<typeof workerLeaseRenewSchema>
export type WorkerLeaseRelease = z.infer<typeof workerLeaseReleaseSchema>
export type WorkerLeaseReconcile = z.infer<typeof workerLeaseReconcileSchema>
export type WorkerLeaseAcquiredPayload = z.infer<typeof workerLeaseAcquiredPayloadSchema>
export type WorkerLeaseReleasedPayload = z.infer<typeof workerLeaseReleasedPayloadSchema>
export type WorkerLeaseExpiredPayload = z.infer<typeof workerLeaseExpiredPayloadSchema>
export type DecisionRequestedPayload = z.infer<typeof decisionRequestedPayloadSchema>
export type DecisionResolvedPayload = z.infer<typeof decisionResolvedPayloadSchema>

export interface GoalSubmittedEventInput {
  actor: z.infer<typeof actorSchema>
  correlationId: string
  goal: GoalSubmission
  goalId: string
  sequence: number
}

export interface DecisionRequestedEventInput {
  actor: z.infer<typeof actorSchema>
  correlationId: string
  decision: DecisionRequest
  decisionId: string
  sequence: number
}

export interface DecisionResolvedEventInput {
  actor: z.infer<typeof actorSchema>
  causationId: string
  correlationId: string
  decision: DecisionRequest
  decisionId: string
  resolution: DecisionResolution
  sequence: number
}

export interface WorkerAssignedEventInput {
  actor: z.infer<typeof actorSchema>
  causationId: string | null
  correlationId: string
  sequence: number
  worker: WorkerAssignment
  workerId: string
}

export interface WorkerStateChangedEventInput {
  actor: z.infer<typeof actorSchema>
  causationId: string
  change: WorkerStateChange
  correlationId: string
  sequence: number
  workerId: string
}

export interface WorkerBriefRecordedEventInput {
  actor: z.infer<typeof actorSchema>
  briefLength: number
  briefSha256: string
  causationId: string
  correlationId: string
  sequence: number
  workerId: string
}

interface WorkerLeaseEventBase {
  actor: z.infer<typeof actorSchema>
  causationId: string
  correlationId: string
  sequence: number
  workerId: string
}

export type WorkerLeaseEventInput = WorkerLeaseEventBase &
  (
    | { eventType: "worker.lease_acquired" | "worker.lease_renewed"; worker: Omit<WorkerLeaseAcquiredPayload["worker"], "id"> }
    | { eventType: "worker.lease_released"; worker: Omit<WorkerLeaseReleasedPayload["worker"], "id"> }
    | { eventType: "worker.lease_expired"; worker: Omit<WorkerLeaseExpiredPayload["worker"], "id"> }
  )
