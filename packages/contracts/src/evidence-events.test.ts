/** @module Validation and integration evidence contract tests. */

import { describe, expect, test } from "bun:test"
import {
  createIntegrationUpdatedEvent,
  createValidationCompletedEvent,
  integrationCompletionSchema,
  integrationUpdatedPayloadSchema,
  validationCompletedPayloadSchema,
  validationRecordSchema
} from "./evidence-events"
import type { IntegrationCompletion, ValidationRecord } from "./evidence-events.types"

const validation = (exitCode: number | null, status: "passed" | "failed"): ValidationRecord => ({
  artifactDirectory: "/tmp/et/validation",
  commitSha: "a".repeat(40),
  completedAt: "2026-10-25T12:01:00.000Z",
  goalId: crypto.randomUUID(),
  idempotencyKey: "validation-1",
  projectId: "github.com/example/repository",
  results: [
    {
      command: "bun run typecheck",
      durationMs: 1_200,
      exitCode,
      phase: "check",
      stderrPath: "/tmp/et/validation/1.stderr.log",
      stdoutPath: "/tmp/et/validation/1.stdout.log",
      timedOut: exitCode === null
    }
  ],
  startedAt: "2026-10-25T12:00:00.000Z",
  status,
  subject: { id: crypto.randomUUID(), type: "worker" }
})

const completion = (overrides: Partial<IntegrationCompletion>): IntegrationCompletion => ({
  aggregateDiff: null,
  artifactDirectory: "/tmp/et/integration",
  branch: "feature/et-goal/integration",
  conflict: null,
  detail: "",
  headSha: null,
  mergeOrder: [],
  overlaps: [],
  resolutions: [],
  scopeViolations: [],
  selection: null,
  sources: [],
  status: "blocked",
  validationId: null,
  worktreePath: "/tmp/et/integration/worktree",
  ...overrides
})

describe("validation evidence", () => {
  test("status must agree with every command result", () => {
    expect(validationRecordSchema.safeParse(validation(0, "passed")).success).toBe(true)
    expect(validationRecordSchema.safeParse(validation(1, "passed")).success).toBe(false)
    expect(validationRecordSchema.safeParse(validation(null, "failed")).success).toBe(true)
  })

  test("creates a validation.completed event on its own aggregate", () => {
    const validationId = crypto.randomUUID()
    const event = createValidationCompletedEvent({
      actor: { id: "command-api", kind: "system" },
      correlationId: crypto.randomUUID(),
      validation: validation(0, "passed"),
      validationId
    })

    expect(event.aggregate).toEqual({ id: validationId, sequence: 1, type: "validation" })
    expect(validationCompletedPayloadSchema.parse(event.payload).validation.id).toBe(validationId)
  })
})

describe("integration evidence", () => {
  test("ties validation and conflict evidence to terminal status", () => {
    expect(integrationCompletionSchema.safeParse(completion({ status: "validated" })).success).toBe(false)
    expect(
      integrationCompletionSchema.safeParse(completion({ status: "validated", validationId: crypto.randomUUID() }))
        .success
    ).toBe(true)
    expect(integrationCompletionSchema.safeParse(completion({ status: "conflicted" })).success).toBe(false)
    expect(
      integrationCompletionSchema.safeParse(
        completion({ conflict: { paths: ["src/a.ts"], workerId: crypto.randomUUID() }, status: "conflicted" })
      ).success
    ).toBe(true)
  })

  test("records started and terminal integration updates", () => {
    const identity = {
      attempt: 1,
      baseRef: "main",
      baseSha: "b".repeat(40),
      goalId: crypto.randomUUID(),
      id: crypto.randomUUID(),
      projectId: "github.com/example/repository"
    }
    const started = createIntegrationUpdatedEvent({
      actor: { id: "command-api", kind: "system" },
      causationId: null,
      correlationId: crypto.randomUUID(),
      integration: { ...identity, status: "started" },
      sequence: 1
    })
    const finished = createIntegrationUpdatedEvent({
      actor: { id: "command-api", kind: "system" },
      causationId: started.eventId,
      correlationId: started.correlationId,
      integration: { ...identity, completion: completion({}), status: "blocked" },
      sequence: 2
    })

    expect(integrationUpdatedPayloadSchema.parse(started.payload).integration.status).toBe("started")
    expect(finished.aggregate.sequence).toBe(2)
    expect(() =>
      createIntegrationUpdatedEvent({
        actor: { id: "command-api", kind: "system" },
        causationId: started.eventId,
        correlationId: started.correlationId,
        integration: { ...identity, completion: completion({}), status: "validated" },
        sequence: 2
      })
    ).toThrow()
  })
})

describe("integrator evidence", () => {
  test("events recorded before the integrator slice still parse, with empty defaults", () => {
    const legacy = {
      integration: {
        attempt: 1,
        baseRef: "main",
        baseSha: "b".repeat(40),
        completion: completion({}),
        goalId: crypto.randomUUID(),
        id: crypto.randomUUID(),
        projectId: "github.com/example/repository",
        status: "blocked"
      }
    }
    const { resolutions: _r, selection: _s, ...oldCompletion } = legacy.integration.completion as Record<string, unknown>
    const parsed = integrationUpdatedPayloadSchema.parse({
      integration: { ...legacy.integration, completion: oldCompletion }
    })
    expect(parsed.integration.resolvesIntegrationId).toBeNull()
    expect("completion" in parsed.integration && parsed.integration.completion.resolutions).toEqual([])
    expect("completion" in parsed.integration && parsed.integration.completion.selection).toBeNull()
  })

  test("a selection must explain itself and a resolution must name its paths", () => {
    expect(
      integrationCompletionSchema.safeParse(
        completion({ selection: { excludedWorkerIds: [crypto.randomUUID()], rationale: "" } })
      ).success
    ).toBe(false)
    expect(
      integrationCompletionSchema.safeParse(
        completion({
          resolutions: [
            {
              conflictedWorkerId: crypto.randomUUID(),
              integratorWorkerId: crypto.randomUUID(),
              paths: [],
              rationale: "kept both",
              rationaleSha256: "c".repeat(64),
              resolvedCommitSha: "d".repeat(40)
            }
          ]
        })
      ).success
    ).toBe(false)
  })
})
