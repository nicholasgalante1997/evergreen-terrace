/** @module GitHub handoff contract tests. */

import { describe, expect, test } from "bun:test"
import { createHandoffUpdatedEvent, handoffCompletionSchema, handoffRequestSchema } from "./handoff-events"
import type { HandoffPlan } from "./handoff-events.types"

const plan: HandoffPlan = {
  baseRef: "main",
  bodyLength: 120,
  bodySha256: "a".repeat(64),
  branch: "feature/et-goal/integration",
  headSha: "b".repeat(40),
  remote: "origin",
  repository: "example/repository",
  supersedesPullRequest: null,
  title: "Goal title"
}

const handoff = (status: "requested" | "completed", withResult: boolean) => ({
  decisionId: crypto.randomUUID(),
  detail: "",
  goalId: crypto.randomUUID(),
  id: crypto.randomUUID(),
  integrationId: crypto.randomUUID(),
  plan,
  projectId: "github.com/example/repository",
  result: withResult
    ? {
        pullRequest: { number: 7, url: "https://github.com/example/repository/pull/7" },
        pushedSha: plan.headSha,
        reconciledSteps: [],
        supersedeCommentUrl: null
      }
    : null,
  status
})

describe("handoff contracts", () => {
  test("requires a result exactly when the handoff completed", () => {
    const event = { actor: { id: "command-api", kind: "system" as const }, causationId: null, correlationId: crypto.randomUUID(), sequence: 1 }
    expect(createHandoffUpdatedEvent({ ...event, handoff: handoff("requested", false) }).aggregate.type).toBe("handoff")
    expect(() => createHandoffUpdatedEvent({ ...event, handoff: handoff("requested", true) })).toThrow()
    expect(() => createHandoffUpdatedEvent({ ...event, handoff: handoff("completed", false) })).toThrow()
  })

  test("rejects malformed repositories and callers supplying their own body digest", () => {
    const { bodyLength: _length, bodySha256: _sha, ...requestPlan } = plan
    const request = { body: "Evidence.", idempotencyKey: "handoff-1", integrationId: crypto.randomUUID(), plan: requestPlan }
    expect(handoffRequestSchema.safeParse(request).success).toBe(true)
    expect(handoffRequestSchema.safeParse({ ...request, plan: { ...requestPlan, repository: "not a repo" } }).success).toBe(false)
    expect(handoffRequestSchema.safeParse({ ...request, plan: plan }).success).toBe(false)
  })

  test("a failed completion must explain itself", () => {
    expect(handoffCompletionSchema.safeParse({ detail: "", status: "failed" }).success).toBe(false)
    expect(handoffCompletionSchema.safeParse({ detail: "push rejected", status: "failed" }).success).toBe(true)
  })
})
