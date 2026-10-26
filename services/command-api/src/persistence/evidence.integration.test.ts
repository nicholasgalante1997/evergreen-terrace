/** @module Validation and integration evidence integration tests against a disposable PostgreSQL. */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { IntegrationCompletion, ValidationRecord } from "@evergreen-terrace/contracts"
import { CommandDatabase } from "./command-database"

const url = process.env["ET_TEST_COMMAND_DATABASE_URL"]
const projectId = "github.com/example/evidence-it"
const baseSha = "c".repeat(40)
const headSha = "d".repeat(40)
const run = crypto.randomUUID()

describe.skipIf(url === undefined)("evidence commands (PostgreSQL)", () => {
  const database = new CommandDatabase(url ?? "")
  let goalId = ""
  let workerId = ""

  const validation = (subject: ValidationRecord["subject"], status: "passed" | "failed"): ValidationRecord => ({
    artifactDirectory: "/tmp/it/validation",
    commitSha: headSha,
    completedAt: new Date().toISOString(),
    goalId,
    idempotencyKey: `validation-${crypto.randomUUID()}`,
    projectId,
    results: [
      {
        command: "bun run test",
        durationMs: 10,
        exitCode: status === "passed" ? 0 : 1,
        phase: "check",
        stderrPath: "/tmp/it/validation/01-check.stderr.log",
        stdoutPath: "/tmp/it/validation/01-check.stdout.log",
        timedOut: false
      }
    ],
    startedAt: new Date().toISOString(),
    status,
    subject
  })

  const completion = (overrides: Partial<IntegrationCompletion>): IntegrationCompletion => ({
    aggregateDiff: null,
    artifactDirectory: "/tmp/it/integration",
    branch: `feature/et-${goalId}/integration`,
    conflict: null,
    detail: "",
    headSha,
    mergeOrder: [workerId],
    overlaps: [],
    resolutions: [],
    scopeViolations: [],
    selection: null,
    sources: [
      {
        branch: "feature/et-x/implementer",
        captureCommitSha: null,
        changedFiles: ["src/a.ts"],
        commitSha: headSha,
        deletions: 0,
        insertions: 1,
        role: "implementer",
        workerId
      }
    ],
    status: "blocked",
    validationId: null,
    worktreePath: "/tmp/it/integration/worktree",
    ...overrides
  })

  beforeAll(async () => {
    await database.connect()
    goalId = (
      await database.submitGoal({
        baseRef: "main",
        baseSha,
        constraints: [],
        description: "Evidence fixture.",
        idempotencyKey: crypto.randomUUID(),
        priorityClass: "p1",
        projectId,
        references: [],
        title: "Evidence integration"
      })
    ).goalId
    workerId = (
      await database.assignWorker({
        adapter: "codex",
        dependsOnWorkerIds: [],
        goalId,
        idempotencyKey: crypto.randomUUID(),
        projectId,
        role: "implementer",
        worktree: {
          artifactDirectory: "/tmp/it/w/artifacts",
          attempt: 1,
          baseRef: "main",
          baseSha,
          branch: "feature/et-x/implementer",
          manifestPath: "/tmp/it/w/manifest.json",
          worktreePath: "/tmp/it/w/worktree"
        }
      })
    ).workerId
  })

  afterAll(async () => {
    await database.close()
  })

  test("records worker validation idempotently and rejects foreign subjects", async () => {
    const record = validation({ id: workerId, type: "worker" }, "passed")
    const first = await database.recordValidation(record)
    const replay = await database.recordValidation(record)
    expect(first.created).toBe(true)
    expect(replay).toEqual({ ...first, created: false })
    await expect(
      database.recordValidation(validation({ id: crypto.randomUUID(), type: "worker" }, "passed"))
    ).rejects.toThrow(/does not belong/)
    expect((await database.listGoalValidations(goalId)).map((entry) => entry.id)).toContain(first.validationId)
  })

  test("allocates attempts, pins the goal base, and enforces completion evidence", async () => {
    await expect(
      database.startIntegration({
        baseRef: "main",
        baseSha: "e".repeat(40),
        goalId,
        idempotencyKey: `bad-base-${run}`,
        projectId
      })
    ).rejects.toThrow(/recorded base/)

    const first = await database.startIntegration({
      baseRef: "main",
      baseSha,
      goalId,
      idempotencyKey: `integration-1-${run}`,
      projectId
    })
    const replay = await database.startIntegration({
      baseRef: "main",
      baseSha,
      goalId,
      idempotencyKey: `integration-1-${run}`,
      projectId
    })
    const second = await database.startIntegration({
      baseRef: "main",
      baseSha,
      goalId,
      idempotencyKey: `integration-2-${run}`,
      projectId
    })
    expect([first.attempt, replay.attempt, replay.created, second.attempt]).toEqual([1, 1, false, 2])

    await expect(database.completeIntegration(first.integrationId, completion({}))).rejects.toThrow(
      /is assigned, not completed/
    )
  })

  test("validated integrations require passing validation of the integration head", async () => {
    await database.recordWorkerBrief(workerId, { prompt: "Implement it." })
    await database.acquireWorkerLease(workerId, { schedulerId: "host-bridge:it", ttlSeconds: 60 })
    await database.changeWorkerState(workerId, { detail: "", schedulerId: "host-bridge:it", state: "running" })
    await database.changeWorkerState(workerId, { detail: "", schedulerId: "host-bridge:it", state: "completed" })

    const integration = await database.startIntegration({
      baseRef: "main",
      baseSha,
      goalId,
      idempotencyKey: `integration-validated-${run}`,
      projectId
    })
    const failing = await database.recordValidation(
      validation({ id: integration.integrationId, type: "integration" }, "failed")
    )
    await expect(
      database.completeIntegration(
        integration.integrationId,
        completion({ status: "validated", validationId: failing.validationId })
      )
    ).rejects.toThrow(/contradicts/)
    await expect(
      database.completeIntegration(
        integration.integrationId,
        completion({ headSha: "f".repeat(40), status: "validation_failed", validationId: failing.validationId })
      )
    ).rejects.toThrow(/head commit/)

    const passing = await database.recordValidation(
      validation({ id: integration.integrationId, type: "integration" }, "passed")
    )
    const done = await database.completeIntegration(
      integration.integrationId,
      completion({ status: "validated", validationId: passing.validationId })
    )
    expect(done).toEqual(expect.objectContaining({ completed: true, status: "validated" }))
    const again = await database.completeIntegration(
      integration.integrationId,
      completion({ status: "validated", validationId: passing.validationId })
    )
    expect(again.completed).toBe(false)
    await expect(
      database.completeIntegration(integration.integrationId, completion({ status: "blocked" }))
    ).rejects.toThrow(/already ended/)
    await expect(
      database.recordValidation(validation({ id: integration.integrationId, type: "integration" }, "passed"))
    ).rejects.toThrow(/already ended/)

    const stored = await database.getIntegration(integration.integrationId)
    expect(stored.completion?.validationId).toBe(passing.validationId)
    expect(stored.sequence).toBe(2)
  })
})
