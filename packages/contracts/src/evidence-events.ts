/** @module Strict validation and integration-train evidence contracts. */

import { z } from "zod"
import { eventEnvelopeSchema } from "./events"
import type { EventEnvelope } from "./events.types"
import type { IntegrationUpdatedEventInput, ValidationCompletedEventInput } from "./evidence-events.types"

const gitShaSchema = z.string().regex(/^[0-9a-f]{40}$/i)
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)
const pathSchema = z.string().min(1).max(4_096)
const repositoryPathSchema = z.string().min(1).max(1_024)

export const validationCommandResultSchema = z
  .object({
    command: z.string().min(1).max(2_048),
    durationMs: z.number().int().min(0),
    /** Null when the command was killed, e.g. on timeout. */
    exitCode: z.number().int().nullable(),
    phase: z.enum(["setup", "check"]),
    stderrPath: pathSchema,
    stdoutPath: pathSchema,
    timedOut: z.boolean()
  })
  .strict()

export const validationSubjectSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(["worker", "integration"])
  })
  .strict()

const validationRecordObjectSchema = z
  .object({
    artifactDirectory: pathSchema,
    commitSha: gitShaSchema,
    completedAt: z.string().datetime({ offset: true }),
    goalId: z.string().uuid(),
    idempotencyKey: z.string().min(1).max(128),
    projectId: z.string().min(1).max(256),
    results: z.array(validationCommandResultSchema).min(1).max(48),
    startedAt: z.string().datetime({ offset: true }),
    status: z.enum(["passed", "failed"]),
    subject: validationSubjectSchema
  })
  .strict()

const validationStatusMatchesResults = (
  validation: z.infer<typeof validationRecordObjectSchema>,
  context: z.RefinementCtx
): void => {
  const passed = validation.results.every((result) => result.exitCode === 0 && !result.timedOut)
  if (passed !== (validation.status === "passed")) {
    context.addIssue({
      code: "custom",
      message: "status must be passed exactly when every command exited 0 without timing out",
      path: ["status"]
    })
  }
}

export const validationRecordSchema = validationRecordObjectSchema.superRefine(validationStatusMatchesResults)

export const validationCompletedPayloadSchema = z
  .object({
    validation: validationRecordObjectSchema.extend({ id: z.string().uuid() }).superRefine(validationStatusMatchesResults)
  })
  .strict()

export const integrationStartSchema = z
  .object({
    baseRef: z.string().min(1).max(512),
    baseSha: gitShaSchema,
    goalId: z.string().uuid(),
    idempotencyKey: z.string().min(1).max(128),
    projectId: z.string().min(1).max(256),
    /** A `conflicted` attempt this attempt resolves with the integrator agent. */
    resolvesIntegrationId: z.string().uuid().nullable().default(null)
  })
  .strict()

/** Deliberate exclusion of worker output, with the engineer's or mayor's stated reason. */
export const integrationSelectionSchema = z
  .object({
    excludedWorkerIds: z.array(z.string().uuid()).min(1).max(16),
    rationale: z.string().min(1).max(4_000)
  })
  .strict()

/** Evidence that an integrator agent resolved one conflicting merge, verified by the host. */
export const integrationResolutionSchema = z
  .object({
    conflictedWorkerId: z.string().uuid(),
    integratorWorkerId: z.string().uuid(),
    paths: z.array(repositoryPathSchema).min(1).max(5_000),
    rationale: z.string().max(8_000),
    rationaleSha256: sha256Schema,
    resolvedCommitSha: gitShaSchema
  })
  .strict()

export const integrationSourceSchema = z
  .object({
    branch: z.string().min(1).max(512),
    /** Factory commit that captured uncommitted worker output, when one was needed. */
    captureCommitSha: gitShaSchema.nullable(),
    changedFiles: z.array(repositoryPathSchema).max(5_000),
    commitSha: gitShaSchema,
    deletions: z.number().int().min(0),
    insertions: z.number().int().min(0),
    role: z.string().min(1).max(64),
    workerId: z.string().uuid()
  })
  .strict()

export const integrationOverlapSchema = z
  .object({
    path: repositoryPathSchema,
    workerIds: z.array(z.string().uuid()).min(2).max(16)
  })
  .strict()

/** Files a planned worker changed outside its approved scope claim. */
export const integrationScopeViolationSchema = z
  .object({
    paths: z.array(repositoryPathSchema).min(1).max(5_000),
    planId: z.string().uuid(),
    taskKey: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
    workerId: z.string().uuid()
  })
  .strict()

export const integrationTerminalStatusSchema = z.enum(["validated", "validation_failed", "conflicted", "blocked"])

export const integrationCompletionSchema = z
  .object({
    aggregateDiff: z
      .object({
        deletions: z.number().int().min(0),
        filesChanged: z.number().int().min(0),
        insertions: z.number().int().min(0),
        path: pathSchema,
        sha256: sha256Schema
      })
      .strict()
      .nullable(),
    artifactDirectory: pathSchema,
    branch: z.string().min(1).max(512),
    conflict: z
      .object({
        paths: z.array(repositoryPathSchema).max(5_000),
        workerId: z.string().uuid()
      })
      .strict()
      .nullable(),
    detail: z.string().max(8_000),
    headSha: gitShaSchema.nullable(),
    mergeOrder: z.array(z.string().uuid()).max(16),
    overlaps: z.array(integrationOverlapSchema).max(1_000),
    resolutions: z.array(integrationResolutionSchema).max(8).default([]),
    scopeViolations: z.array(integrationScopeViolationSchema).max(16).default([]),
    selection: integrationSelectionSchema.nullable().default(null),
    sources: z.array(integrationSourceSchema).max(16),
    status: integrationTerminalStatusSchema,
    validationId: z.string().uuid().nullable(),
    worktreePath: pathSchema
  })
  .strict()
  .superRefine((completion, context) => {
    const requiresValidation = completion.status === "validated" || completion.status === "validation_failed"
    if (requiresValidation !== (completion.validationId !== null)) {
      context.addIssue({
        code: "custom",
        message: "validationId is required exactly for validated and validation_failed integrations",
        path: ["validationId"]
      })
    }
    if ((completion.status === "conflicted") !== (completion.conflict !== null)) {
      context.addIssue({
        code: "custom",
        message: "conflict evidence is required exactly for conflicted integrations",
        path: ["conflict"]
      })
    }
  })

const integrationIdentitySchema = z
  .object({
    attempt: z.number().int().min(1),
    baseRef: z.string().min(1).max(512),
    baseSha: gitShaSchema,
    goalId: z.string().uuid(),
    id: z.string().uuid(),
    projectId: z.string().min(1).max(256),
    resolvesIntegrationId: z.string().uuid().nullable().default(null)
  })
  .strict()

export const integrationUpdatedPayloadSchema = z
  .object({
    integration: z.union([
      integrationIdentitySchema.extend({ status: z.literal("started") }),
      integrationIdentitySchema
        .extend({ completion: integrationCompletionSchema, status: integrationTerminalStatusSchema })
        .refine((integration) => integration.status === integration.completion.status, {
          message: "integration status must equal completion.status",
          path: ["status"]
        })
    ])
  })
  .strict()

export const createValidationCompletedEvent = (input: ValidationCompletedEventInput): EventEnvelope =>
  eventEnvelopeSchema.parse({
    actor: input.actor,
    aggregate: { id: input.validationId, sequence: 1, type: "validation" },
    causationId: null,
    correlationId: input.correlationId,
    eventId: crypto.randomUUID(),
    eventType: "validation.completed",
    occurredAt: new Date().toISOString(),
    payload: validationCompletedPayloadSchema.parse({ validation: { ...input.validation, id: input.validationId } }),
    schemaVersion: 1
  })

export const createIntegrationUpdatedEvent = (input: IntegrationUpdatedEventInput): EventEnvelope =>
  eventEnvelopeSchema.parse({
    actor: input.actor,
    aggregate: { id: input.integration.id, sequence: input.sequence, type: "integration" },
    causationId: input.causationId,
    correlationId: input.correlationId,
    eventId: crypto.randomUUID(),
    eventType: "integration.updated",
    occurredAt: new Date().toISOString(),
    payload: integrationUpdatedPayloadSchema.parse({ integration: input.integration }),
    schemaVersion: 1
  })
