/** @module Jarvis tests: goal-scoped evidence, checked citations, and a proposal allowlist. */

import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ReadOnlyAgentPort, ReadOnlyAgentRun } from "../planning/read-only-agent.types"
import { jarvisAnswerSchema } from "./jarvis-answer"
import { JarvisService } from "./jarvis-service"

const goal = "11111111-1111-4111-8111-111111111111"
const other = "22222222-2222-4222-8222-222222222222"
const lists: Record<string, Record<string, unknown>> = {
  "/v1/decisions": { decisions: [] },
  "/v1/events": {
    events: [
      { aggregateId: "i-1", eventId: "e-1", eventType: "integration.updated" },
      { aggregateId: "i-other", eventId: "e-2", eventType: "integration.updated" }
    ]
  },
  "/v1/goals": {
    goals: [
      { id: goal, title: "Mine" },
      { id: other, title: "Theirs" }
    ]
  },
  "/v1/handoffs": { handoffs: [] },
  "/v1/integrations": {
    integrations: [
      { goal_id: goal, id: "i-1", status: "conflicted" },
      { goal_id: other, id: "i-other", status: "validated" }
    ]
  },
  "/v1/onboardings": { onboardings: [] },
  "/v1/plans": { plans: [] },
  "/v1/validations": { validations: [] },
  "/v1/workers": { workers: [] }
}
const fetcher = (async (url: URL) => Response.json(lists[new URL(url).pathname] ?? {})) as unknown as typeof fetch

const schema = {
  additionalProperties: false,
  properties: { branchClass: { type: "string" }, goalId: { type: "string" } },
  required: ["goalId"],
  type: "object"
}

const block = (value: unknown) => `\`\`\`json\n${JSON.stringify(value)}\n\`\`\``
const answer = (sourceId: string) => ({
  answer: "Attempt 1 conflicted.",
  claims: [
    { confidence: "high", sources: [{ id: sourceId, kind: "integration" }], statement: "The integration conflicted." }
  ],
  proposedActions: [
    {
      arguments: { goalId: goal },
      consequence: "Runs a new attempt.",
      label: "Re-integrate",
      tool: "evergreen.integration.run"
    }
  ]
})

class ScriptedAgent implements ReadOnlyAgentPort {
  readonly runs: ReadOnlyAgentRun[] = []
  readonly seenFiles: string[] = []

  constructor(private readonly replies: string[]) {}

  async run(input: ReadOnlyAgentRun) {
    this.runs.push(input)
    this.seenFiles.push(await Bun.file(join(input.checkoutPath, "integrations.json")).text())
    let prompt: string | null = input.prompt
    let turns = 0
    while (prompt !== null) {
      prompt = (await input.continueWith?.(this.replies[turns] ?? "")) ?? null
      turns += 1
    }
    return { stopReason: "end_turn", turns }
  }
}

let root = ""
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "et-jarvis-"))
})
afterAll(async () => {
  await rm(root, { force: true, recursive: true })
})

test("scopes evidence to the goal and rejects a citation of a record Jarvis was not given", async () => {
  const agent = new ScriptedAgent([block(answer("i-other")), block(answer("i-1"))])
  const jarvis = new JarvisService({
    agent,
    defaultAdapter: "claude",
    fetcher,
    jarvisRoot: root,
    preferences: async () => [],
    readApiUrl: "http://read",
    toolSchemas: () => ({ "evergreen.integration.run": schema })
  })
  const outcome = await jarvis.ask({ goalId: goal, question: "Why is this goal stuck?" })

  expect(outcome.status).toBe("answered")
  expect(agent.seenFiles[0]).toContain("i-1")
  expect(agent.seenFiles[0]).not.toContain("i-other")
  expect(agent.runs[0]?.prompt).toContain("Why is this goal stuck?")
  expect(agent.runs[0]?.prompt).toContain("You never act.")
  expect(await Bun.file(join(outcome.evidenceDirectory, "events.json")).text()).not.toContain("e-2")
  const stored = (await Bun.file(join(root, outcome.questionId, "answer.json")).json()) as { status: string }
  expect(stored.status).toBe("answered")
})

test("proposals are limited to governed, non-approving tools", () => {
  const proposal = answer("i-1")
  expect(jarvisAnswerSchema.safeParse(proposal).success).toBe(true)
  for (const tool of ["evergreen.decision.resolve", "evergreen.handoff.execute", "shell"]) {
    expect(
      jarvisAnswerSchema.safeParse({ ...proposal, proposedActions: [{ ...proposal.proposedActions[0], tool }] }).success
    ).toBe(false)
  }
})

test("proposed arguments must match the tool's own schema", async () => {
  const wrong = {
    ...answer("i-1"),
    proposedActions: [{ ...answer("i-1").proposedActions[0], arguments: { integrationId: "x" } }]
  }
  const agent = new ScriptedAgent([block(wrong), block(answer("i-1"))])
  const jarvis = new JarvisService({
    agent,
    defaultAdapter: "claude",
    fetcher,
    jarvisRoot: root,
    preferences: async () => [],
    readApiUrl: "http://read",
    toolSchemas: () => ({ "evergreen.integration.run": schema })
  })
  expect((await jarvis.ask({ goalId: goal, question: "Next step?" })).status).toBe("answered")
  expect(agent.runs).toHaveLength(1)
  expect(agent.runs[0]?.prompt).toContain('"required":["goalId"]')
})
