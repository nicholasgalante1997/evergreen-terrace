/** @module Strict mayor goal-plan contracts: bounded contract, scope claims, dependency graph, and worker briefs. */

import { z } from "zod"
import { decisionOptionSchema, eventEnvelopeSchema, workerAdapterSchema } from "./events"
import type { EventEnvelope } from "./events.types"
import type { PlanUpdatedEventInput } from "./plan-events.types"

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)
const optionIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/)
const shortTextSchema = z.string().min(1).max(1_000)

export const planTaskKeySchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/)

/** Roles the factory assigns itself; a plan task may not claim them. */
export const reservedPlanRoles = ["integration", "integrator", "mayor", "discovery"] as const

/** The engine safety floor's risk categories; `.et` may only require cards for a subset, never fewer than it lists. */
export const riskCategorySchema = z.enum([
  "credential",
  "dependency",
  "destructive",
  "external_side_effect",
  "migration",
  "release",
  "security"
])

/**
 * A repository-relative path or glob (`src/api/**`, `README.md`). Absolute
 * paths, parent traversal, and backslashes are refused so a claim cannot name
 * anything outside the repository.
 */
export const scopePatternSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (pattern) =>
      !pattern.startsWith("/") &&
      !pattern.includes("\\") &&
      !pattern.includes("\0") &&
      !pattern.split("/").some((segment) => segment === ".." || segment === "."),
    { message: "scope patterns are repository-relative and may not traverse or be absolute" }
  )

export const mayorTaskSchema = z
  .object({
    acceptance: z.array(shortTextSchema).min(1).max(16),
    /** The worker's task, written by the mayor. The host wraps it with the contract and scope claim. */
    brief: z.string().min(1).max(20_000),
    dependsOn: z.array(planTaskKeySchema).max(6).default([]),
    key: planTaskKeySchema,
    role: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,63}$/)
      .refine((role) => !(reservedPlanRoles as readonly string[]).includes(role), {
        message: "role is reserved for the factory"
      }),
    /** The task's scope claim: every file it may change. */
    scope: z.array(scopePatternSchema).min(1).max(32),
    title: z.string().min(1).max(240)
  })
  .strict()

export const planQuestionSchema = z
  .object({
    id: optionIdSchema,
    options: z.array(decisionOptionSchema).min(2).max(4),
    question: z.string().min(1).max(2_000),
    recommendedOptionId: optionIdSchema.nullable().default(null)
  })
  .strict()
  .refine(
    (question) =>
      question.recommendedOptionId === null ||
      question.options.some((option) => option.id === question.recommendedOptionId),
    { message: "recommendedOptionId must identify one of the options", path: ["recommendedOptionId"] }
  )

export const planRiskSchema = z
  .object({
    category: z.union([riskCategorySchema, z.literal("other")]),
    detail: z.string().min(1).max(2_000),
    mitigation: z.string().max(2_000).default("")
  })
  .strict()

/**
 * Orders tasks so every dependency comes first; ties keep plan order.
 * Throws on an unknown key, a self-edge, or a cycle.
 */
export const planTaskOrder = (tasks: ReadonlyArray<{ dependsOn: readonly string[]; key: string }>): string[] => {
  const keys = new Set(tasks.map((task) => task.key))
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (dependency === task.key || !keys.has(dependency)) {
        throw new Error(`Task ${task.key} has an invalid dependency: ${dependency}`)
      }
    }
  }
  const ordered: string[] = []
  const placed = new Set<string>()
  while (ordered.length < tasks.length) {
    const next = tasks.find(
      (task) => !placed.has(task.key) && task.dependsOn.every((dependency) => placed.has(dependency))
    )
    if (next === undefined) {
      throw new Error("Plan task dependencies contain a cycle")
    }
    ordered.push(next.key)
    placed.add(next.key)
  }
  return ordered
}

const uniqueIssue = (context: z.RefinementCtx, values: readonly string[], path: string, label: string): void => {
  const seen = new Set<string>()
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) {
      context.addIssue({ code: "custom", message: `Duplicate ${label}: ${value}`, path: [path, index] })
    }
    seen.add(value)
  }
}

const mayorPlanObjectSchema = z
  .object({
    contract: z
      .object({
        acceptance: z.array(shortTextSchema).min(1).max(16),
        assumptions: z.array(shortTextSchema).max(16).default([]),
        outOfScope: z.array(shortTextSchema).max(16).default([])
      })
      .strict(),
    /** Other goals in this repository whose output must integrate first. */
    integrateAfterGoalIds: z.array(z.string().uuid()).max(4).default([]),
    /** Material ambiguities; when present the plan waits for the engineer instead of guessing. */
    questions: z.array(planQuestionSchema).max(4).default([]),
    risks: z.array(planRiskSchema).max(16).default([]),
    summary: z.string().min(1).max(4_000),
    tasks: z.array(mayorTaskSchema).max(6).default([]),
    validation: z
      .object({ notes: z.array(shortTextSchema).max(16).default([]) })
      .strict()
      .default({ notes: [] })
  })
  .strict()

/** What the mayor agent must return. Graph rules are enforced here, not trusted from the agent. */
export const mayorPlanSchema = mayorPlanObjectSchema.superRefine((plan, context) => {
  if (plan.questions.length === 0 && plan.tasks.length === 0) {
    context.addIssue({ code: "custom", message: "A plan without questions needs at least one task", path: ["tasks"] })
  }
  uniqueIssue(
    context,
    plan.tasks.map((task) => task.key),
    "tasks",
    "task key"
  )
  uniqueIssue(
    context,
    plan.tasks.map((task) => task.role),
    "tasks",
    "task role"
  )
  uniqueIssue(
    context,
    plan.questions.map((question) => question.id),
    "questions",
    "question id"
  )
  try {
    planTaskOrder(plan.tasks)
  } catch (error) {
    context.addIssue({ code: "custom", message: error instanceof Error ? error.message : String(error), path: ["tasks"] })
  }
})

/** A task as events carry it: the brief text stays in command state, events get its digest. */
export const planTaskSummarySchema = mayorTaskSchema
  .omit({ brief: true })
  .extend({ briefLength: z.number().int().min(1).max(20_000), briefSha256: sha256Schema })
  .strict()

export const planProposalSummarySchema = mayorPlanObjectSchema
  .omit({ tasks: true })
  .extend({ tasks: z.array(planTaskSummarySchema).max(6) })
  .strict()

/** Files two goals' scope claims both cover, found before any worker starts. */
export const planOverlapSchema = z
  .object({
    otherGoalId: z.string().uuid(),
    otherPlanId: z.string().uuid(),
    otherTaskKey: planTaskKeySchema,
    paths: z.array(z.string().min(1).max(1_024)).min(1).max(200),
    taskKey: planTaskKeySchema
  })
  .strict()

export const planStatusSchema = z.enum([
  "drafting",
  "needs_input",
  "proposed",
  "launching",
  "launched",
  "rejected",
  "failed"
])

export const planMayorSessionSchema = z
  .object({
    adapter: workerAdapterSchema,
    artifactDirectory: z.string().min(1).max(4_096),
    checkoutPath: z.string().min(1).max(4_096)
  })
  .strict()

export const planDraftStartSchema = z
  .object({
    /** The engineer's revision request, passed to the mayor verbatim. */
    feedback: z.string().max(8_000).default(""),
    goalId: z.string().uuid(),
    idempotencyKey: z.string().min(1).max(128),
    mayor: planMayorSessionSchema,
    revisionOf: z.string().uuid().nullable().default(null)
  })
  .strict()

export const planDraftCompletionSchema = z.discriminatedUnion("status", [
  z
    .object({
      /** Plan risks whose category `.et` lists under `risk.decision_required`. */
      flaggedRisks: z.array(riskCategorySchema).max(7).default([]),
      overlaps: z.array(planOverlapSchema).max(64).default([]),
      proposal: mayorPlanSchema,
      status: z.literal("proposed")
    })
    .strict(),
  z.object({ detail: z.string().min(1).max(8_000), status: z.literal("failed") }).strict()
])

export const planLaunchCompletionSchema = z
  .object({
    workers: z
      .array(z.object({ taskKey: planTaskKeySchema, workerId: z.string().uuid() }).strict())
      .min(1)
      .max(6)
  })
  .strict()

export const planUpdatedPayloadSchema = z
  .object({
    plan: z
      .object({
        decisionId: z.string().uuid().nullable(),
        detail: z.string().max(8_000),
        goalId: z.string().uuid(),
        id: z.string().uuid(),
        launch: planLaunchCompletionSchema.nullable(),
        mayor: planMayorSessionSchema,
        overlaps: z.array(planOverlapSchema).max(64),
        projectId: z.string().min(1).max(256),
        proposal: planProposalSummarySchema.nullable(),
        questionDecisionIds: z.array(z.string().uuid()).max(4),
        revision: z.number().int().min(1),
        revisionOf: z.string().uuid().nullable(),
        status: planStatusSchema
      })
      .strict()
      .refine((plan) => (plan.status === "launched") === (plan.launch !== null), {
        message: "launch evidence is present exactly when the plan launched",
        path: ["launch"]
      })
      .refine((plan) => plan.status === "drafting" || plan.status === "failed" || plan.proposal !== null, {
        message: "a plan past drafting carries its proposal",
        path: ["proposal"]
      })
  })
  .strict()

export const createPlanUpdatedEvent = (input: PlanUpdatedEventInput): EventEnvelope =>
  eventEnvelopeSchema.parse({
    actor: input.actor,
    aggregate: { id: input.plan.id, sequence: input.sequence, type: "plan" },
    causationId: input.causationId,
    correlationId: input.correlationId,
    eventId: crypto.randomUUID(),
    eventType: "plan.updated",
    occurredAt: new Date().toISOString(),
    payload: planUpdatedPayloadSchema.parse({ plan: input.plan }),
    schemaVersion: 1
  })
