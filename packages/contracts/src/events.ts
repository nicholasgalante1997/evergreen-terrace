/** @module Strict event schemas and event-envelope factories. */

import { z } from "zod"
import type {
  DecisionRequest,
  DecisionRequestedEventInput,
  DecisionResolution,
  DecisionResolvedEventInput,
  EventEnvelope,
  GoalSubmission,
  GoalSubmittedEventInput,
  WorkerAssignment,
  WorkerAssignedEventInput,
  WorkerBriefRecordedEventInput,
  WorkerLeaseEventInput,
  WorkerStateChangedEventInput
} from "./events.types"

export const eventTypeSchema = z.enum([
  "goal.submitted",
  "goal.priority_changed",
  "goal.dependency_changed",
  "decision.requested",
  "decision.resolved",
  "worker.assigned",
  "worker.state_changed",
  "worker.brief_recorded",
  "worker.lease_acquired",
  "worker.lease_renewed",
  "worker.lease_released",
  "worker.lease_expired",
  "worktree.created",
  "integration.updated",
  "validation.completed",
  "handoff.updated",
  "workspace.synced"
])

export const actorSchema = z
  .object({
    kind: z.enum(["engineer", "jarvis", "mayor", "worker", "system", "mcp_client"]),
    id: z.string().min(1).max(128)
  })
  .strict()

export const aggregateSchema = z
  .object({
    type: z.enum(["goal", "decision", "worker", "workspace", "integration", "validation", "handoff"]),
    id: z.string().uuid(),
    sequence: z.number().int().positive()
  })
  .strict()

export const goalSubmittedPayloadSchema = z
  .object({
    goal: z
      .object({
        id: z.string().uuid(),
        projectId: z.string().min(1).max(256),
        title: z.string().min(1).max(240),
        description: z.string().min(1).max(20_000),
        priorityClass: z.string().min(1).max(64),
        baseRef: z.string().min(1).max(512),
        baseSha: z.string().regex(/^[0-9a-f]{40}$/i),
        idempotencyKey: z.string().min(1).max(128)
      })
      .strict()
  })
  .strict()

export const eventEnvelopeSchema = z
  .object({
    eventId: z.string().uuid(),
    eventType: eventTypeSchema,
    schemaVersion: z.literal(1),
    occurredAt: z.string().datetime({ offset: true }),
    correlationId: z.string().uuid(),
    causationId: z.string().uuid().nullable(),
    actor: actorSchema,
    aggregate: aggregateSchema,
    payload: z.record(z.string(), z.unknown())
  })
  .strict()

export const goalSubmissionSchema = z
  .object({
    projectId: z.string().min(1).max(256),
    title: z.string().min(1).max(240),
    description: z.string().min(1).max(20_000),
    priorityClass: z.string().min(1).max(64),
    baseRef: z.string().min(1).max(512),
    baseSha: z.string().regex(/^[0-9a-f]{40}$/i),
    idempotencyKey: z.string().min(1).max(128),
    references: z.array(z.string().max(2_048)).max(32).default([]),
    constraints: z.array(z.string().max(2_048)).max(32).default([])
  })
  .strict()

export const decisionStatusSchema = z.enum(["requested", "approved", "rejected"])

export const workerAdapterSchema = z.enum(["claude", "codex"])

export const workerStateSchema = z.enum(["assigned", "running", "awaiting_decision", "completed", "failed", "cancelled"])

export const workerDependencyIdsSchema = z
  .array(z.string().uuid())
  .max(16)
  .refine((ids) => new Set(ids).size === ids.length, "dependsOnWorkerIds must not contain duplicates")

export const workerWorktreeSchema = z
  .object({
    artifactDirectory: z.string().min(1).max(4_096),
    attempt: z.number().int().min(1),
    baseRef: z.string().min(1).max(512),
    baseSha: z.string().regex(/^[0-9a-f]{40}$/i),
    branch: z.string().min(1).max(512),
    manifestPath: z.string().min(1).max(4_096),
    worktreePath: z.string().min(1).max(4_096)
  })
  .strict()

export const workerAssignmentSchema = z
  .object({
    adapter: workerAdapterSchema,
    dependsOnWorkerIds: workerDependencyIdsSchema.default([]),
    goalId: z.string().uuid(),
    idempotencyKey: z.string().min(1).max(128),
    projectId: z.string().min(1).max(256),
    role: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    worktree: workerWorktreeSchema
  })
  .strict()

/** Stable identity of one host scheduler process; it owns worker leases. */
export const schedulerIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/)

export const workerLeaseTtlSecondsSchema = z.number().int().min(15).max(600)

export const workerStateChangeSchema = z
  .object({
    detail: z.string().max(8_000).default(""),
    schedulerId: schedulerIdSchema.nullable().default(null),
    state: z.enum(["running", "awaiting_decision", "completed", "failed", "cancelled"])
  })
  .strict()

export const workerBriefSchema = z
  .object({
    prompt: z.string().min(1).max(40_000)
  })
  .strict()

export const workerLeaseAcquireSchema = z
  .object({
    schedulerId: schedulerIdSchema,
    ttlSeconds: workerLeaseTtlSecondsSchema.default(90)
  })
  .strict()

export const workerLeaseRenewSchema = workerLeaseAcquireSchema

export const workerLeaseReleaseSchema = z
  .object({
    schedulerId: schedulerIdSchema
  })
  .strict()

export const workerLeaseReconcileSchema = workerLeaseReleaseSchema

export const decisionOptionSchema = z
  .object({
    detail: z.string().min(1).max(8_000),
    id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    label: z.string().min(1).max(240)
  })
  .strict()

export const decisionRequestSchema = z
  .object({
    category: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    context: z.string().min(1).max(20_000),
    goalId: z.string().uuid().nullable(),
    idempotencyKey: z.string().min(1).max(128),
    options: z.array(decisionOptionSchema).min(1).max(8),
    projectId: z.string().min(1).max(256),
    recommendedOptionId: z
      .string()
      .regex(/^[a-z][a-z0-9_-]{0,63}$/)
      .nullable(),
    title: z.string().min(1).max(240)
  })
  .strict()
  .superRefine((decision, context) => {
    if (
      decision.recommendedOptionId !== null &&
      !decision.options.some((option) => option.id === decision.recommendedOptionId)
    ) {
      context.addIssue({
        code: "custom",
        message: "recommendedOptionId must identify one of the provided options",
        path: ["recommendedOptionId"]
      })
    }
  })

export const decisionResolutionSchema = z
  .object({
    note: z.string().max(8_000).default(""),
    selectedOptionId: z
      .string()
      .regex(/^[a-z][a-z0-9_-]{0,63}$/)
      .nullable(),
    status: z.enum(["approved", "rejected"])
  })
  .strict()
  .superRefine((resolution, context) => {
    if (resolution.status === "approved" && resolution.selectedOptionId === null) {
      context.addIssue({
        code: "custom",
        message: "Approved decisions require a selected option",
        path: ["selectedOptionId"]
      })
    }
  })

export const decisionRequestedPayloadSchema = z
  .object({
    decision: decisionRequestSchema.extend({ id: z.string().uuid(), status: z.literal("requested") })
  })
  .strict()

export const decisionResolvedPayloadSchema = z
  .object({
    decision: decisionRequestSchema.extend({
      id: z.string().uuid(),
      resolution: decisionResolutionSchema,
      status: z.enum(["approved", "rejected"])
    })
  })
  .strict()

/**
 * Projection-specific extraction contract. A projection deliberately consumes
 * only the resolved state so additive producer fields do not break replay.
 * Producers still validate against decisionResolvedPayloadSchema above.
 */
export const decisionResolvedProjectionPayloadSchema = z
  .object({
    decision: z
      .object({
        id: z.string().uuid(),
        resolution: decisionResolutionSchema,
        status: z.enum(["approved", "rejected"])
      })
      .passthrough()
  })
  .strict()

export const workerAssignedPayloadSchema = z
  .object({
    worker: workerAssignmentSchema.extend({ id: z.string().uuid(), state: z.literal("assigned") })
  })
  .strict()

export const workerStateChangedPayloadSchema = z
  .object({
    worker: z
      .object({
        detail: z.string(),
        id: z.string().uuid(),
        state: workerStateSchema
      })
      .strict()
  })
  .strict()

export const workerBriefRecordedPayloadSchema = z
  .object({
    worker: z
      .object({
        briefLength: z.number().int().min(1).max(40_000),
        briefSha256: z.string().regex(/^[0-9a-f]{64}$/),
        id: z.string().uuid()
      })
      .strict()
  })
  .strict()

const heldLeaseSchema = z
  .object({
    expiresAt: z.string().datetime({ offset: true }),
    owner: schedulerIdSchema
  })
  .strict()

export const workerLeaseAcquiredPayloadSchema = z
  .object({ worker: z.object({ id: z.string().uuid(), lease: heldLeaseSchema }).strict() })
  .strict()

export const workerLeaseRenewedPayloadSchema = workerLeaseAcquiredPayloadSchema

export const workerLeaseReleasedPayloadSchema = z
  .object({ worker: z.object({ id: z.string().uuid(), lease: z.object({ owner: schedulerIdSchema }).strict() }).strict() })
  .strict()

/**
 * An expired lease is reconciled by another scheduler. The worker state at
 * expiry is recorded so a reviewer can see whether an ACP session may have
 * performed side effects that the factory deliberately does not replay.
 */
export const workerLeaseExpiredPayloadSchema = z
  .object({
    worker: z
      .object({
        id: z.string().uuid(),
        lease: z.object({ expiredAt: z.string().datetime({ offset: true }), owner: schedulerIdSchema }).strict(),
        reconciledBy: schedulerIdSchema,
        stateAtExpiry: workerStateSchema
      })
      .strict()
  })
  .strict()

const eventDecision = (decision: DecisionRequest): DecisionRequest =>
  decisionRequestSchema.parse({
    category: decision.category,
    context: decision.context,
    goalId: decision.goalId,
    idempotencyKey: decision.idempotencyKey,
    options: decision.options,
    projectId: decision.projectId,
    recommendedOptionId: decision.recommendedOptionId,
    title: decision.title
  })

const eventWorkerAssignment = (worker: WorkerAssignment): WorkerAssignment =>
  workerAssignmentSchema.parse({
    adapter: worker.adapter,
    dependsOnWorkerIds: worker.dependsOnWorkerIds,
    goalId: worker.goalId,
    idempotencyKey: worker.idempotencyKey,
    projectId: worker.projectId,
    role: worker.role,
    worktree: worker.worktree
  })

export const createGoalSubmittedEvent = (input: GoalSubmittedEventInput): EventEnvelope => {
  return eventEnvelopeSchema.parse({
    eventId: crypto.randomUUID(),
    eventType: "goal.submitted",
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    correlationId: input.correlationId,
    causationId: null,
    actor: input.actor,
    aggregate: {
      type: "goal",
      id: input.goalId,
      sequence: input.sequence
    },
    payload: {
      goal: {
        id: input.goalId,
        projectId: input.goal.projectId,
        title: input.goal.title,
        description: input.goal.description,
        priorityClass: input.goal.priorityClass,
        baseRef: input.goal.baseRef,
        baseSha: input.goal.baseSha,
        idempotencyKey: input.goal.idempotencyKey
      }
    }
  })
}

export const createDecisionRequestedEvent = (input: DecisionRequestedEventInput): EventEnvelope => {
  const decision = eventDecision(input.decision)
  return eventEnvelopeSchema.parse({
    actor: input.actor,
    aggregate: { id: input.decisionId, sequence: input.sequence, type: "decision" },
    causationId: null,
    correlationId: input.correlationId,
    eventId: crypto.randomUUID(),
    eventType: "decision.requested",
    occurredAt: new Date().toISOString(),
    payload: { decision: { ...decision, id: input.decisionId, status: "requested" } },
    schemaVersion: 1
  })
}

export const createDecisionResolvedEvent = (input: DecisionResolvedEventInput): EventEnvelope => {
  const decision = eventDecision(input.decision)
  return eventEnvelopeSchema.parse({
    actor: input.actor,
    aggregate: { id: input.decisionId, sequence: input.sequence, type: "decision" },
    causationId: input.causationId,
    correlationId: input.correlationId,
    eventId: crypto.randomUUID(),
    eventType: "decision.resolved",
    occurredAt: new Date().toISOString(),
    payload: {
      decision: {
        ...decision,
        id: input.decisionId,
        resolution: input.resolution,
        status: input.resolution.status
      }
    },
    schemaVersion: 1
  })
}

export const createWorkerAssignedEvent = (input: WorkerAssignedEventInput): EventEnvelope => {
  const worker = eventWorkerAssignment(input.worker)
  return eventEnvelopeSchema.parse({
    actor: input.actor,
    aggregate: { id: input.workerId, sequence: input.sequence, type: "worker" },
    causationId: input.causationId,
    correlationId: input.correlationId,
    eventId: crypto.randomUUID(),
    eventType: "worker.assigned",
    occurredAt: new Date().toISOString(),
    payload: { worker: { ...worker, id: input.workerId, state: "assigned" } },
    schemaVersion: 1
  })
}

export const createWorkerStateChangedEvent = (input: WorkerStateChangedEventInput): EventEnvelope =>
  eventEnvelopeSchema.parse({
    actor: input.actor,
    aggregate: { id: input.workerId, sequence: input.sequence, type: "worker" },
    causationId: input.causationId,
    correlationId: input.correlationId,
    eventId: crypto.randomUUID(),
    eventType: "worker.state_changed",
    occurredAt: new Date().toISOString(),
    payload: { worker: { detail: input.change.detail, id: input.workerId, state: input.change.state } },
    schemaVersion: 1
  })

export const createWorkerBriefRecordedEvent = (input: WorkerBriefRecordedEventInput): EventEnvelope =>
  eventEnvelopeSchema.parse({
    actor: input.actor,
    aggregate: { id: input.workerId, sequence: input.sequence, type: "worker" },
    causationId: input.causationId,
    correlationId: input.correlationId,
    eventId: crypto.randomUUID(),
    eventType: "worker.brief_recorded",
    occurredAt: new Date().toISOString(),
    payload: workerBriefRecordedPayloadSchema.parse({
      worker: { briefLength: input.briefLength, briefSha256: input.briefSha256, id: input.workerId }
    }),
    schemaVersion: 1
  })

const workerLeasePayloadSchemas = {
  "worker.lease_acquired": workerLeaseAcquiredPayloadSchema,
  "worker.lease_expired": workerLeaseExpiredPayloadSchema,
  "worker.lease_released": workerLeaseReleasedPayloadSchema,
  "worker.lease_renewed": workerLeaseRenewedPayloadSchema
} as const

export const createWorkerLeaseEvent = (input: WorkerLeaseEventInput): EventEnvelope =>
  eventEnvelopeSchema.parse({
    actor: input.actor,
    aggregate: { id: input.workerId, sequence: input.sequence, type: "worker" },
    causationId: input.causationId,
    correlationId: input.correlationId,
    eventId: crypto.randomUUID(),
    eventType: input.eventType,
    occurredAt: new Date().toISOString(),
    payload: workerLeasePayloadSchemas[input.eventType].parse({ worker: { ...input.worker, id: input.workerId } }),
    schemaVersion: 1
  })

export const eventEnvelopeJsonSchema = z.toJSONSchema(eventEnvelopeSchema)
