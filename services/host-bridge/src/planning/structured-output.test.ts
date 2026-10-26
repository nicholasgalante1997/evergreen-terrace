/** @module Structured agent output tests: extraction, validation, and bounded repair turns. */

import { describe, expect, test } from "bun:test"
import { z } from "zod"
import type { ReadOnlyAgentPort, ReadOnlyAgentRun } from "./read-only-agent.types"
import { extractJson, parseStructured, runStructuredSession } from "./structured-output"

const schema = z.object({ count: z.number().int().min(1) }).strict()

/** Replies with each scripted turn in order, through the runner's continueWith contract. */
class ScriptedAgent implements ReadOnlyAgentPort {
  readonly prompts: string[] = []

  constructor(private readonly replies: string[]) {}

  async run(input: ReadOnlyAgentRun) {
    let prompt: string | null = input.prompt
    let turns = 0
    while (prompt !== null) {
      this.prompts.push(prompt)
      const reply = this.replies[turns] ?? ""
      turns += 1
      prompt = (await input.continueWith?.(reply)) ?? null
    }
    return { stopReason: "end_turn", turns }
  }
}

const run = {
  adapter: "claude" as const,
  artifactDirectory: "/tmp/a",
  checkoutPath: "/tmp/c",
  label: "test",
  prompt: "Plan it."
}

describe("structured output", () => {
  test("takes the last fenced block and ignores narration", () => {
    expect(extractJson('I looked around.\n```json\n{"count": 1}\n```\nThen:\n```json\n{"count": 2}\n```')).toEqual({
      count: 2
    })
    expect(extractJson('Answer: {"count": 3} done')).toEqual({ count: 3 })
    expect(() => extractJson("no json here")).toThrow()
  })

  test("reports schema and host issues by path", () => {
    expect(parseStructured('```json\n{"count": 0}\n```', schema)).toMatchObject({ ok: false })
    const parsed = parseStructured('```json\n{"count": 9}\n```', schema, (value) =>
      value.count > 5 ? ["count: too many"] : []
    )
    expect(parsed).toEqual({ issues: ["count: too many"], ok: false })
  })

  test("repairs an invalid reply in the same session", async () => {
    const agent = new ScriptedAgent(['```json\n{"count": "two"}\n```', '```json\n{"count": 2}\n```'])
    const outcome = await runStructuredSession(agent, run, schema)
    expect(outcome).toEqual({ ok: true, turns: 2, value: { count: 2 } })
    expect(agent.prompts[1]).toContain("count:")
  })

  test("gives up after the repair budget and explains why", async () => {
    const agent = new ScriptedAgent(["nope", "still nope", "nope again", "never asked"])
    const outcome = await runStructuredSession(agent, run, schema, () => [], 2)
    expect(outcome.ok).toBe(false)
    expect(agent.prompts).toHaveLength(3)
    expect(outcome.ok ? "" : outcome.detail).toContain("No valid output after 3 turn(s)")
  })

  test("turns a crashed session into a failure, not an exception", async () => {
    const agent: ReadOnlyAgentPort = { run: async () => Promise.reject(new Error("adapter exited")) }
    expect(await runStructuredSession(agent, run, schema)).toEqual({
      detail: "Agent session failed: adapter exited",
      ok: false
    })
  })
})
