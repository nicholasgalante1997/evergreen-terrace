/** @module Strict repository-onboarding contracts: cited discovery, one approval packet, and its applied result. */

import { z } from "zod"
import { eventEnvelopeSchema, workerAdapterSchema } from "./events"
import type { EventEnvelope } from "./events.types"
import type { OnboardingUpdatedEventInput } from "./onboarding-events.types"
import { riskCategorySchema } from "./plan-events"

const gitShaSchema = z.string().regex(/^[0-9a-f]{40}$/i)
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)
const pathSchema = z.string().min(1).max(4_096)
const repositoryPathSchema = z.string().min(1).max(1_024)
const textSchema = z.string().min(1).max(2_000)
const commandSchema = z.string().min(1).max(2_048)
const branchSchema = z.string().min(1).max(256)

export const discoveryAreaSchema = z.enum(["git", "topology", "validation", "risk", "conventions"])

/** Every conclusion cites a file (optionally a line) or the read-only command whose output supports it. */
export const discoveryCitationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("file"),
      line: z.number().int().min(1).nullable().default(null),
      path: repositoryPathSchema
    })
    .strict(),
  z
    .object({
      command: z.string().min(1).max(500),
      excerpt: z.string().max(1_000).default(""),
      kind: z.literal("command")
    })
    .strict()
])

export const discoveryFindingSchema = z
  .object({
    area: discoveryAreaSchema,
    citations: z.array(discoveryCitationSchema).min(1).max(8),
    claim: textSchema,
    confidence: z.enum(["high", "medium", "low"])
  })
  .strict()

/** What one read-only discovery agent must return. */
export const discoveryReportSchema = z
  .object({
    findings: z.array(discoveryFindingSchema).min(1).max(40),
    proposals: z
      .object({
        protectedBranches: z.array(branchSchema).max(16).default([]),
        risks: z
          .array(z.object({ category: riskCategorySchema, detail: textSchema }).strict())
          .max(16)
          .default([]),
        validationCommands: z.array(commandSchema).max(32).default([]),
        validationSetup: z.array(commandSchema).max(16).default([])
      })
      .strict()
      .default({ protectedBranches: [], risks: [], validationCommands: [], validationSetup: [] })
  })
  .strict()

/** What the mayor must return after reading the facts and every discovery report. */
export const onboardingProposalSchema = z
  .object({
    allowedBaseRefs: z.array(branchSchema).min(1).max(16),
    ambiguities: z
      .array(z.object({ detail: z.string().max(2_000).default(""), question: textSchema }).strict())
      .max(16)
      .default([]),
    moduleMap: z
      .array(z.object({ path: repositoryPathSchema, purpose: textSchema }).strict())
      .max(60)
      .default([]),
    profile: z
      .object({
        /** Candidates only: promoting one to the global profile is a separate, gated action. */
        candidateGlobalPreferences: z.array(textSchema).max(16).default([]),
        immutablePolicy: z.array(textSchema).max(16).default([]),
        projectConventions: z.array(textSchema).max(32).default([])
      })
      .strict(),
    protectedBranches: z.array(branchSchema).max(16).default([]),
    risks: z
      .array(
        z
          .object({
            category: z.union([riskCategorySchema, z.literal("other")]),
            citations: z.array(discoveryCitationSchema).max(8).default([]),
            detail: textSchema
          })
          .strict()
      )
      .max(32)
      .default([]),
    validation: z
      .object({
        commands: z.array(commandSchema).min(1).max(32),
        setup: z.array(commandSchema).max(16).default([]),
        timeoutSeconds: z.number().int().min(10).max(7_200).default(1_200)
      })
      .strict(),
    validationEvidence: z
      .array(z.object({ citations: z.array(discoveryCitationSchema).min(1).max(8), command: commandSchema }).strict())
      .max(32)
      .default([])
  })
  .strict()

/** A report as the packet keeps it: the host checks every file citation against the base commit. */
export const verifiedDiscoveryReportSchema = z
  .object({
    areas: z.array(discoveryAreaSchema).min(1).max(5),
    artifactDirectory: pathSchema,
    key: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
    report: discoveryReportSchema.nullable(),
    /** Why the report is missing, when the agent failed or returned invalid output. */
    failure: z.string().max(4_000).nullable(),
    unverifiedCitations: z.array(z.string().max(1_100)).max(320)
  })
  .strict()

/** Deterministic facts the host gathers itself; agents never supply these. */
export const onboardingFactsSchema = z
  .object({
    activeBranch: z.string().max(256),
    baseRef: branchSchema,
    baseSha: gitShaSchema,
    collectedAt: z.string().datetime({ offset: true }),
    defaultBranch: branchSchema.nullable(),
    existingPolicy: z.boolean(),
    headSha: gitShaSchema,
    localBranches: z.array(branchSchema).max(200),
    manifests: z.array(repositoryPathSchema).max(100),
    projectId: z.string().min(1).max(256),
    remote: z.object({ name: z.string().regex(/^[A-Za-z0-9._-]+$/), url: z.string().min(1).max(2_048) }).strict(),
    topLevel: z.array(repositoryPathSchema).max(200),
    trackedFileCount: z.number().int().min(0)
  })
  .strict()

export const onboardingPacketSchema = z
  .object({
    configSha256: sha256Schema,
    /** The exact `.et/config.toml` approval would commit. */
    configToml: z.string().min(1).max(20_000),
    discovery: z.array(verifiedDiscoveryReportSchema).min(1).max(4),
    facts: onboardingFactsSchema,
    proposal: onboardingProposalSchema
  })
  .strict()

export const onboardingStatusSchema = z.enum(["discovering", "proposed", "applying", "applied", "declined", "failed"])

export const onboardingDiscoverySessionSchema = z
  .object({
    adapter: workerAdapterSchema,
    baseRef: branchSchema,
    baseSha: gitShaSchema,
    workers: z
      .array(
        z
          .object({
            areas: z.array(discoveryAreaSchema).min(1).max(5),
            artifactDirectory: pathSchema,
            checkoutPath: pathSchema,
            key: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/)
          })
          .strict()
      )
      .min(2)
      .max(4)
  })
  .strict()

export const onboardingStartSchema = z
  .object({
    discovery: onboardingDiscoverySessionSchema,
    feedback: z.string().max(8_000).default(""),
    idempotencyKey: z.string().min(1).max(128),
    projectId: z.string().min(1).max(256),
    revisionOf: z.string().uuid().nullable().default(null)
  })
  .strict()

export const onboardingDiscoveryCompletionSchema = z.discriminatedUnion("status", [
  z.object({ packet: onboardingPacketSchema, status: z.literal("proposed") }).strict(),
  z.object({ detail: z.string().min(1).max(8_000), status: z.literal("failed") }).strict()
])

export const onboardingResultSchema = z
  .object({
    branch: branchSchema,
    commitSha: gitShaSchema,
    validation: z
      .object({
        artifactDirectory: pathSchema,
        commands: z
          .array(
            z.object({ command: commandSchema, exitCode: z.number().int().nullable(), timedOut: z.boolean() }).strict()
          )
          .max(48),
        status: z.enum(["passed", "failed"])
      })
      .strict()
      .nullable(),
    worktreePath: pathSchema
  })
  .strict()

export const onboardingApplyCompletionSchema = z.discriminatedUnion("status", [
  z
    .object({ detail: z.string().max(8_000).default(""), result: onboardingResultSchema, status: z.literal("applied") })
    .strict(),
  z.object({ detail: z.string().min(1).max(8_000), status: z.literal("failed") }).strict()
])

export const onboardingUpdatedPayloadSchema = z
  .object({
    onboarding: z
      .object({
        decisionId: z.string().uuid().nullable(),
        detail: z.string().max(8_000),
        discovery: onboardingDiscoverySessionSchema,
        id: z.string().uuid(),
        packet: onboardingPacketSchema.nullable(),
        projectId: z.string().min(1).max(256),
        result: onboardingResultSchema.nullable(),
        revision: z.number().int().min(1),
        revisionOf: z.string().uuid().nullable(),
        status: onboardingStatusSchema
      })
      .strict()
      .refine((onboarding) => (onboarding.status === "applied") === (onboarding.result !== null), {
        message: "result is present exactly when onboarding was applied",
        path: ["result"]
      })
      .refine((onboarding) => (onboarding.decisionId === null) === (onboarding.packet === null), {
        message: "an approval packet and its decision card exist together",
        path: ["decisionId"]
      })
  })
  .strict()

export const createOnboardingUpdatedEvent = (input: OnboardingUpdatedEventInput): EventEnvelope =>
  eventEnvelopeSchema.parse({
    actor: input.actor,
    aggregate: { id: input.onboarding.id, sequence: input.sequence, type: "onboarding" },
    causationId: input.causationId,
    correlationId: input.correlationId,
    eventId: crypto.randomUUID(),
    eventType: "onboarding.updated",
    occurredAt: new Date().toISOString(),
    payload: onboardingUpdatedPayloadSchema.parse({ onboarding: input.onboarding }),
    schemaVersion: 1
  })
