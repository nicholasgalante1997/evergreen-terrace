/** @module Strict GitHub handoff contracts: an approved, immutable push-and-PR plan. */

import { z } from "zod"
import { eventEnvelopeSchema } from "./events"
import type { EventEnvelope } from "./events.types"
import type { HandoffUpdatedEventInput } from "./handoff-events.types"

const gitShaSchema = z.string().regex(/^[0-9a-f]{40}$/i)

export const githubRepositorySchema = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)

const pullRequestReferenceSchema = z
  .object({
    number: z.number().int().positive(),
    url: z.string().url().max(2_048)
  })
  .strict()

/** Everything the engineer approves. Execution may perform exactly these actions and nothing else. */
export const handoffPlanSchema = z
  .object({
    baseRef: z.string().min(1).max(512),
    bodyLength: z.number().int().min(1).max(60_000),
    bodySha256: z.string().regex(/^[0-9a-f]{64}$/),
    branch: z.string().min(1).max(512),
    headSha: gitShaSchema,
    remote: z.string().regex(/^[A-Za-z0-9._-]+$/),
    repository: githubRepositorySchema,
    /** An earlier goal PR that receives a pointer comment to this one. */
    supersedesPullRequest: z.number().int().positive().nullable(),
    title: z.string().min(1).max(240)
  })
  .strict()

export const handoffRequestSchema = z
  .object({
    body: z.string().min(1).max(60_000),
    idempotencyKey: z.string().min(1).max(128),
    integrationId: z.string().uuid(),
    plan: handoffPlanSchema.omit({ bodyLength: true, bodySha256: true })
  })
  .strict()

export const handoffResultSchema = z
  .object({
    pullRequest: pullRequestReferenceSchema,
    pushedSha: gitShaSchema,
    /** Steps observed as already done on GitHub during recovery, so they were not repeated. */
    reconciledSteps: z.array(z.enum(["push", "pull_request", "supersede_comment"])).max(3),
    supersedeCommentUrl: z.string().url().max(2_048).nullable()
  })
  .strict()

export const handoffStatusSchema = z.enum(["requested", "executing", "completed", "failed", "declined"])

export const handoffCompletionSchema = z.discriminatedUnion("status", [
  z.object({ detail: z.string().max(8_000), result: handoffResultSchema, status: z.literal("completed") }).strict(),
  z.object({ detail: z.string().min(1).max(8_000), status: z.literal("failed") }).strict()
])

export const handoffUpdatedPayloadSchema = z
  .object({
    handoff: z
      .object({
        decisionId: z.string().uuid(),
        detail: z.string().max(8_000),
        goalId: z.string().uuid(),
        id: z.string().uuid(),
        integrationId: z.string().uuid(),
        plan: handoffPlanSchema,
        projectId: z.string().min(1).max(256),
        result: handoffResultSchema.nullable(),
        status: handoffStatusSchema
      })
      .strict()
      .refine((handoff) => (handoff.status === "completed") === (handoff.result !== null), {
        message: "result is present exactly when the handoff completed",
        path: ["result"]
      })
  })
  .strict()

export const createHandoffUpdatedEvent = (input: HandoffUpdatedEventInput): EventEnvelope =>
  eventEnvelopeSchema.parse({
    actor: input.actor,
    aggregate: { id: input.handoff.id, sequence: input.sequence, type: "handoff" },
    causationId: input.causationId,
    correlationId: input.correlationId,
    eventId: crypto.randomUUID(),
    eventType: "handoff.updated",
    occurredAt: new Date().toISOString(),
    payload: handoffUpdatedPayloadSchema.parse({ handoff: input.handoff }),
    schemaVersion: 1
  })
