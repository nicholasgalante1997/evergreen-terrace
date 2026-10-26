/** @module GitHub handoff command integration tests against a disposable PostgreSQL. */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { SQL } from "bun"
import type { HandoffResult } from "@evergreen-terrace/contracts"
import { CommandDatabase } from "./command-database"

const url = process.env["ET_TEST_COMMAND_DATABASE_URL"]
const projectId = "github.com/example/handoff-it"
const baseSha = "1".repeat(40)
const headSha = "2".repeat(40)
const run = crypto.randomUUID()

describe.skipIf(url === undefined)("handoff commands (PostgreSQL)", () => {
  const database = new CommandDatabase(url ?? "")
  const raw = new SQL(url ?? "")
  let goalId = ""
  let workerId = ""

  /** Builds a validated integration through the real command paths. */
  const validatedIntegration = async (label: string) => {
    const integration = await database.startIntegration({
      baseRef: "main",
      baseSha,
      goalId,
      idempotencyKey: `${label}-${run}`,
      projectId
    })
    const validation = await database.recordValidation({
      artifactDirectory: "/tmp/it/v",
      commitSha: headSha,
      completedAt: new Date().toISOString(),
      goalId,
      idempotencyKey: `v-${label}-${run}`,
      projectId,
      results: [{ command: "true", durationMs: 1, exitCode: 0, phase: "check", stderrPath: "/tmp/e", stdoutPath: "/tmp/o", timedOut: false }],
      startedAt: new Date().toISOString(),
      status: "passed",
      subject: { id: integration.integrationId, type: "integration" }
    })
    await database.completeIntegration(integration.integrationId, {
      aggregateDiff: { deletions: 0, filesChanged: 1, insertions: 1, path: "/tmp/it/aggregate.diff", sha256: "3".repeat(64) },
      artifactDirectory: "/tmp/it/i",
      branch: `feature/et-${goalId}/integration-${label}`,
      conflict: null,
      detail: "",
      headSha,
      mergeOrder: [workerId],
      overlaps: [],
      sources: [],
      status: "validated",
      validationId: validation.validationId,
      worktreePath: "/tmp/it/i/worktree"
    })
    return integration.integrationId
  }

  const request = (integrationId: string, label: string, overrides: Record<string, unknown> = {}) =>
    database.requestHandoff({
      body: "## Evidence\n",
      idempotencyKey: `handoff-${label}-${run}`,
      integrationId,
      plan: {
        baseRef: "main",
        branch: `feature/et-${goalId}/integration-${label}`,
        headSha,
        remote: "origin",
        repository: "example/handoff-it",
        supersedesPullRequest: null,
        title: "Goal",
        ...overrides
      }
    })

  const result: HandoffResult = {
    pullRequest: { number: 12, url: "https://github.com/example/handoff-it/pull/12" },
    pushedSha: headSha,
    reconciledSteps: [],
    supersedeCommentUrl: null
  }

  beforeAll(async () => {
    await database.connect()
    goalId = (
      await database.submitGoal({
        baseRef: "main",
        baseSha,
        constraints: [],
        description: "Handoff fixture.",
        idempotencyKey: `goal-${run}`,
        priorityClass: "p1",
        projectId,
        references: [],
        title: "Handoff integration"
      })
    ).goalId
    workerId = (
      await database.assignWorker({
        adapter: "claude",
        dependsOnWorkerIds: [],
        goalId,
        idempotencyKey: `worker-${run}`,
        projectId,
        role: "implementer",
        worktree: {
          artifactDirectory: "/tmp/it/w/a",
          attempt: 1,
          baseRef: "main",
          baseSha,
          branch: "feature/et-x/implementer",
          manifestPath: "/tmp/it/w/m.json",
          worktreePath: "/tmp/it/w/wt"
        }
      })
    ).workerId
  })

  afterAll(async () => {
    await database.close()
    await raw.close()
  })

  test("creates the plan and its external_side_effect card atomically, and gates execution on approval", async () => {
    const integrationId = await validatedIntegration("approve")
    await expect(request(integrationId, "approve", { headSha: "4".repeat(40) })).rejects.toThrow(/validated integration's branch and head/)
    const requested = await request(integrationId, "approve")
    expect((await request(integrationId, "approve")).created).toBe(false)
    await expect(
      database.requestHandoff({ body: "x", idempotencyKey: `other-${run}`, integrationId, plan: (await database.getHandoff(requested.handoffId)).plan })
    ).rejects.toThrow()

    const decision = await database.getDecision(requested.decisionId)
    expect(decision.category).toBe("external_side_effect")
    expect(decision.context).toContain(`Push commit ${headSha}`)
    expect(decision.context).toContain("Nothing is merged")

    await expect(database.beginHandoff(requested.handoffId)).rejects.toThrow(/awaiting approval/)
    await database.resolveDecision(requested.decisionId, { note: "ok", selectedOptionId: "approve", status: "approved" })
    expect((await database.beginHandoff(requested.handoffId)).status).toBe("executing")
    expect((await database.beginHandoff(requested.handoffId)).resumed).toBe(true)

    await expect(
      database.completeHandoff(requested.handoffId, { detail: "", result: { ...result, pushedSha: "5".repeat(40) }, status: "completed" })
    ).rejects.toThrow(/other than the approved head/)
    await database.completeHandoff(requested.handoffId, { detail: "push rejected", status: "failed" })
    expect((await database.beginHandoff(requested.handoffId)).status).toBe("executing")
    await database.completeHandoff(requested.handoffId, { detail: "done", result, status: "completed" })

    const stored = await database.getHandoff(requested.handoffId)
    expect(stored.status).toBe("completed")
    expect(stored.result?.pullRequest.number).toBe(12)
    const events = await raw`
      SELECT envelope->'payload'->'handoff'->>'status' AS status FROM evergreen.events
      WHERE aggregate_id = ${requested.handoffId} ORDER BY aggregate_sequence
    `
    expect(events.map((row: { status: string }) => row.status)).toEqual(["requested", "executing", "failed", "executing", "completed"])
    const published = await raw`
      SELECT envelope::text AS envelope FROM evergreen.outbox WHERE envelope->'aggregate'->>'id' = ${requested.handoffId}
    `
    expect(published).toHaveLength(5)
    expect(published.some((row: { envelope: string }) => row.envelope.includes("## Evidence"))).toBe(false)
  })

  test("a rejected or declined card ends the handoff without execution", async () => {
    const integrationId = await validatedIntegration("decline")
    const requested = await request(integrationId, "decline")
    await database.resolveDecision(requested.decisionId, { note: "", selectedOptionId: "decline", status: "approved" })
    expect((await database.beginHandoff(requested.handoffId)).status).toBe("declined")
    await expect(database.completeHandoff(requested.handoffId, { detail: "", result, status: "completed" })).rejects.toThrow(
      /declined, not executing/
    )
  })

  test("refuses to hand off an integration that is not validated", async () => {
    const started = await database.startIntegration({ baseRef: "main", baseSha, goalId, idempotencyKey: `open-${run}`, projectId })
    await expect(request(started.integrationId, "open")).rejects.toThrow(/Only a validated integration/)
  })
})
