/** @module Validated JSON output from an agent session, with bounded repair turns. */

import type { z } from "zod"
import type { ReadOnlyAgentPort, ReadOnlyAgentRun, StructuredOutcome } from "./read-only-agent.types"

const maximumIssues = 20

/**
 * The JSON object an agent returned: the last fenced block (```json or ```),
 * else the text itself when it is one JSON object. Narration around it is ignored.
 */
export const extractJson = (text: string): unknown => {
  const blocks = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((match) => match[1] ?? "")
  const candidate = blocks.at(-1) ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)
  if (candidate.trim().length === 0) {
    throw new Error("The reply contains no JSON object")
  }
  return JSON.parse(candidate)
}

export type ParsedOutput<T> = { ok: true; value: T } | { issues: string[]; ok: false }

/** Schema first, then the host's own checks; every problem is reported back to the agent. */
export const parseStructured = <T>(
  text: string,
  schema: z.ZodType<T>,
  check: (value: T) => string[] = () => []
): ParsedOutput<T> => {
  let raw: unknown
  try {
    raw = extractJson(text)
  } catch (error) {
    return { issues: [error instanceof Error ? error.message : String(error)], ok: false }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return {
      issues: parsed.error.issues
        .slice(0, maximumIssues)
        .map((issue) => `${issue.path.length === 0 ? "(root)" : issue.path.join(".")}: ${issue.message}`),
      ok: false
    }
  }
  const issues = check(parsed.data)
  return issues.length === 0 ? { ok: true, value: parsed.data } : { issues: issues.slice(0, maximumIssues), ok: false }
}

export const repairPrompt = (issues: readonly string[]): string =>
  [
    "Your JSON did not pass validation:",
    ...issues.map((issue) => `- ${issue}`),
    "",
    "Reply with the complete corrected JSON object in one ```json fenced block, and nothing else."
  ].join("\n")

/**
 * Runs one read-only session and returns its validated output. An invalid
 * reply gets up to `maxRepairs` follow-up turns that list the problems; the
 * agent's output is never trusted until it parses.
 */
export const runStructuredSession = async <T>(
  agent: ReadOnlyAgentPort,
  run: Omit<ReadOnlyAgentRun, "continueWith">,
  schema: z.ZodType<T>,
  check: (value: T) => string[] = () => [],
  maxRepairs = 2
): Promise<StructuredOutcome<T>> => {
  let value: T | undefined
  let issues: string[] = []
  let repairs = 0
  try {
    const result = await agent.run({
      ...run,
      continueWith: async (turnText) => {
        const parsed = parseStructured(turnText, schema, check)
        if (parsed.ok) {
          value = parsed.value
          return null
        }
        issues = parsed.issues
        if (repairs >= maxRepairs) {
          return null
        }
        repairs += 1
        return repairPrompt(parsed.issues)
      }
    })
    return value === undefined
      ? { detail: `No valid output after ${result.turns} turn(s): ${issues.join("; ")}`.slice(0, 8_000), ok: false }
      : { ok: true, turns: result.turns, value }
  } catch (error) {
    return {
      detail: `Agent session failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 8_000),
      ok: false
    }
  }
}
