/** @module Jarvis's answer contract and the host checks that make every claim traceable. */

import { z } from "zod"

/** The kinds of durable record a claim may cite; each is a file in the evidence directory. */
export const evidenceKinds = [
  "goal",
  "plan",
  "worker",
  "decision",
  "integration",
  "validation",
  "handoff",
  "event",
  "onboarding"
] as const

/**
 * What Jarvis may propose. Each runs only when the engineer clicks it, through
 * the same governed tool and policy as any other client. Approving cards,
 * executing handoffs, and resolving decisions are deliberately absent: those
 * stay explicit engineer acts on the card itself.
 */
export const proposableTools = [
  "evergreen.plan.draft",
  "evergreen.plan.launch",
  "evergreen.schedule.resume",
  "evergreen.validation.run",
  "evergreen.integration.run",
  "evergreen.integration.resolve",
  "evergreen.handoff.request"
] as const

const sourceSchema = z.object({ id: z.string().min(1).max(128), kind: z.enum(evidenceKinds) }).strict()

export const jarvisAnswerSchema = z
  .object({
    /** The direct answer, in Markdown, without social filler. */
    answer: z.string().min(1).max(8_000),
    claims: z
      .array(
        z
          .object({
            confidence: z.enum(["high", "medium", "low"]),
            sources: z.array(sourceSchema).min(1).max(8),
            statement: z.string().min(1).max(1_000)
          })
          .strict()
      )
      .max(20),
    /** What Jarvis would need to see to be sure, and could not. */
    missingEvidence: z.array(z.string().min(1).max(1_000)).max(10).default([]),
    proposedActions: z
      .array(
        z
          .object({
            arguments: z.record(z.string(), z.unknown()),
            consequence: z.string().min(1).max(1_000),
            label: z.string().min(1).max(120),
            tool: z.enum(proposableTools)
          })
          .strict()
      )
      .max(4)
      .default([])
  })
  .strict()

export type JarvisAnswer = z.infer<typeof jarvisAnswerSchema>

/** Every cited record must be one the host actually gave Jarvis. */
export const answerIssues = (answer: JarvisAnswer, known: ReadonlyMap<string, ReadonlySet<string>>): string[] =>
  answer.claims.flatMap((claim, index) =>
    claim.sources
      .filter((source) => !(known.get(source.kind)?.has(source.id) ?? false))
      .map(
        (source) =>
          `claims.${index}.sources: ${source.kind} ${source.id} is not in the evidence directory; cite only records you read there`
      )
  )

interface ToolInputSchema {
  additionalProperties?: unknown
  properties?: Record<string, { type?: unknown }>
  required?: string[]
}

const matchesType = (value: unknown, type: unknown): boolean => {
  switch (type) {
    case "string":
      return typeof value === "string"
    case "boolean":
      return typeof value === "boolean"
    case "number":
      return typeof value === "number"
    case "integer":
      return Number.isInteger(value)
    case "array":
      return Array.isArray(value)
    default:
      return true
  }
}

/** A structural check of proposed arguments against the tool's own input schema, so a click cannot fail on shape. */
export const proposalIssues = (answer: JarvisAnswer, schemas: Readonly<Record<string, unknown>>): string[] =>
  answer.proposedActions.flatMap((action, index) => {
    const schema = schemas[action.tool] as ToolInputSchema | undefined
    if (schema === undefined) {
      return [`proposedActions.${index}: ${action.tool} is not available on this bridge`]
    }
    const properties = schema.properties ?? {}
    return [
      ...(schema.required ?? [])
        .filter((name) => !(name in action.arguments))
        .map((name) => `proposedActions.${index}.arguments: ${action.tool} requires "${name}"`),
      ...Object.entries(action.arguments).flatMap(([name, value]) => {
        const property = properties[name]
        if (property === undefined) {
          return schema.additionalProperties === false
            ? [`proposedActions.${index}.arguments: ${action.tool} has no argument "${name}"`]
            : []
        }
        return matchesType(value, property.type)
          ? []
          : [`proposedActions.${index}.arguments.${name}: expected ${String(property.type)}`]
      })
    ]
  })
