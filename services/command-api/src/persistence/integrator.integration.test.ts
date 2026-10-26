/** @module Integrator-evidence command rules against a disposable PostgreSQL. */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { IntegrationCompletionInput } from "@evergreen-terrace/contracts"
import { CommandDatabase } from "./command-database"

const url = process.env["ET_TEST_COMMAND_DATABASE_URL"]
const projectId = "github.com/example/integrator-it"
const baseSha = "6".repeat(40)
const headSha = "7".repeat(40)
const run = crypto.randomUUID()

describe.skipIf(url === undefined)("integrator evidence (PostgreSQL)", () => {
  const database = new CommandDatabase(url ?? "")
  let goalId = ""
  const workers: Record<string, string> = {}

  const assign = async (role: string) =>
    (
      await database.assignWorker({
        adapter: "claude",
        dependsOnWorkerIds: [],
        goalId,
        idempotencyKey: `${role}-${run}`,
        projectId,
        role,
        worktree: {
          artifactDirectory: `/tmp/it/${role}/a`,
          attempt: 1,
          baseRef: "main",
          baseSha,
          branch: `feature/et-x/${role}`,
          manifestPath: `/tmp/it/${role}/m.json`,
          worktreePath: `/tmp/it/${role}/wt`
        }
      })
    ).workerId

  const complete = async (workerId: string) => {
    await database.recordWorkerBrief(workerId, { prompt: "Do the work." })
    await database.acquireWorkerLease(workerId, { schedulerId: "host-bridge:it", ttlSeconds: 60 })
    await database.changeWorkerState(workerId, { detail: "", schedulerId: "host-bridge:it", state: "running" })
    await database.changeWorkerState(workerId, { detail: "", schedulerId: "host-bridge:it", state: "completed" })
  }

  const start = (label: string, resolvesIntegrationId: string | null = null) =>
    database.startIntegration({ baseRef: "main", baseSha, goalId, idempotencyKey: `${label}-${run}`, projectId, resolvesIntegrationId })

  const completion = (overrides: Partial<IntegrationCompletionInput>): IntegrationCompletionInput => ({
    aggregateDiff: null,
    artifactDirectory: "/tmp/it/i",
    branch: "feature/et-x/integration",
    conflict: null,
    detail: "",
    headSha,
    mergeOrder: [],
    overlaps: [],
    sources: [],
    status: "blocked",
    validationId: null,
    worktreePath: "/tmp/it/i/wt",
    ...overrides
  })

  const source = (workerId: string) => ({
    branch: "feature/et-x/s",
    captureCommitSha: null,
    changedFiles: ["a.txt"],
    commitSha: headSha,
    deletions: 0,
    insertions: 1,
    role: "s",
    workerId
  })

  const resolution = (conflictedWorkerId: string, integratorWorkerId: string) => ({
    conflictedWorkerId,
    integratorWorkerId,
    paths: ["a.txt"],
    rationale: "kept both",
    rationaleSha256: "8".repeat(64),
    resolvedCommitSha: headSha
  })

  beforeAll(async () => {
    await database.connect()
    goalId = (
      await database.submitGoal({
        baseRef: "main",
        baseSha,
        constraints: [],
        description: "Integrator fixture.",
        idempotencyKey: `goal-${run}`,
        priorityClass: "p1",
        projectId,
        references: [],
        title: "Integrator integration"
      })
    ).goalId
    for (const role of ["left", "right", "integrator", "excluded"]) {
      workers[role] = await assign(role)
    }
    for (const role of ["left", "right", "integrator"]) {
      await complete(workers[role] ?? "")
    }
  })

  afterAll(async () => {
    await database.close()
  })

  test("a resolve attempt must reference a conflicted attempt of the same goal", async () => {
    const open = await start("open")
    await expect(start("resolve-open", open.integrationId)).rejects.toThrow(/Only a conflicted integration can be resolved/)
    await database.completeIntegration(
      open.integrationId,
      completion({ conflict: { paths: ["a.txt"], workerId: workers.right ?? "" }, sources: [source(workers.left ?? ""), source(workers.right ?? "")], status: "conflicted" })
    )
    const resolving = await start("resolve", open.integrationId)
    expect((await database.getIntegration(resolving.integrationId)).resolvesIntegrationId).toBe(open.integrationId)
  })

  test("resolutions require a resolve attempt and a completed integrator; integrators are never sources", async () => {
    const plain = await start("plain")
    await expect(
      database.completeIntegration(
        plain.integrationId,
        completion({ resolutions: [resolution(workers.right ?? "", workers.integrator ?? "")], sources: [source(workers.right ?? "")] })
      )
    ).rejects.toThrow(/Only an attempt that resolves/)
    await expect(
      database.completeIntegration(plain.integrationId, completion({ sources: [source(workers.integrator ?? "")] }))
    ).rejects.toThrow(/cannot be an integration source/)

    const conflicted = await start("conflicted-2")
    await database.completeIntegration(
      conflicted.integrationId,
      completion({ conflict: { paths: ["a.txt"], workerId: workers.right ?? "" }, status: "conflicted" })
    )
    const resolving = await start("resolve-2", conflicted.integrationId)
    await expect(
      database.completeIntegration(
        resolving.integrationId,
        completion({ resolutions: [resolution(workers.right ?? "", workers.left ?? "")], sources: [source(workers.right ?? "")] })
      )
    ).rejects.toThrow(/is not a completed integrator/)
    await expect(
      database.completeIntegration(
        resolving.integrationId,
        completion({ resolutions: [resolution(workers.left ?? "", workers.integrator ?? "")], sources: [source(workers.right ?? "")] })
      )
    ).rejects.toThrow(/is not an integration source/)
    const done = await database.completeIntegration(
      resolving.integrationId,
      completion({ resolutions: [resolution(workers.right ?? "", workers.integrator ?? "")], sources: [source(workers.left ?? ""), source(workers.right ?? "")] })
    )
    expect(done.completed).toBe(true)
    expect((await database.getIntegration(resolving.integrationId)).completion?.resolutions).toHaveLength(1)
  })

  test("an excluded worker cannot also be integrated", async () => {
    const selecting = await start("selecting")
    await expect(
      database.completeIntegration(
        selecting.integrationId,
        completion({ selection: { excludedWorkerIds: [workers.left ?? ""], rationale: "dup" }, sources: [source(workers.left ?? "")] })
      )
    ).rejects.toThrow(/both excluded and integrated/)
    const done = await database.completeIntegration(
      selecting.integrationId,
      completion({ selection: { excludedWorkerIds: [workers.excluded ?? ""], rationale: "Out of scope." }, sources: [source(workers.left ?? "")] })
    )
    expect(done.completed).toBe(true)
  })
})
