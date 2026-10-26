/** @module Worker brief/lease command integration tests against a disposable PostgreSQL. */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { SQL } from "bun"
import { CommandDatabase } from "./command-database"

const url = process.env["ET_TEST_COMMAND_DATABASE_URL"]

describe.skipIf(url === undefined)("worker scheduling commands (PostgreSQL)", () => {
  const database = new CommandDatabase(url ?? "")
  const raw = new SQL(url ?? "")
  let goalId = ""

  const assign = async (role: string, dependsOnWorkerIds: string[] = []) => {
    const result = await database.assignWorker({
      adapter: "claude",
      dependsOnWorkerIds,
      goalId,
      idempotencyKey: `${role}-${crypto.randomUUID()}`,
      projectId: "github.com/example/scheduler-it",
      role,
      worktree: {
        artifactDirectory: `/tmp/it/${role}/artifacts`,
        attempt: 1,
        baseRef: "main",
        baseSha: "a".repeat(40),
        branch: `feature/et-${role}`,
        manifestPath: `/tmp/it/${role}/manifest.json`,
        worktreePath: `/tmp/it/${role}/worktree`
      }
    })
    return result.workerId
  }

  const eventTypes = async (workerId: string): Promise<string[]> =>
    (
      await raw`SELECT event_type FROM evergreen.events WHERE aggregate_id = ${workerId} ORDER BY aggregate_sequence`
    ).map((row: { event_type: string }) => row.event_type)

  beforeAll(async () => {
    await database.connect()
    goalId = (
      await database.submitGoal({
        baseRef: "main",
        baseSha: "a".repeat(40),
        constraints: [],
        description: "Integration fixture for the durable scheduler.",
        idempotencyKey: crypto.randomUUID(),
        priorityClass: "p1",
        projectId: "github.com/example/scheduler-it",
        references: [],
        title: "Scheduler integration"
      })
    ).goalId
  })

  afterAll(async () => {
    await database.close()
    await raw.close()
  })

  test("full lease lifecycle writes state, events, and outbox together", async () => {
    const workerId = await assign("implementer")
    const scheduler = "host-bridge:it:1"

    await expect(database.acquireWorkerLease(workerId, { schedulerId: scheduler, ttlSeconds: 60 })).rejects.toThrow(/brief/)
    expect((await database.recordWorkerBrief(workerId, { prompt: "Implement it." })).recorded).toBe(true)
    expect((await database.recordWorkerBrief(workerId, { prompt: "Implement it." })).recorded).toBe(false)
    await expect(database.recordWorkerBrief(workerId, { prompt: "Something else." })).rejects.toThrow(/immutable/)

    await expect(
      database.changeWorkerState(workerId, { detail: "", schedulerId: scheduler, state: "running" })
    ).rejects.toThrow(/live lease/)
    expect((await database.acquireWorkerLease(workerId, { schedulerId: scheduler, ttlSeconds: 60 })).changed).toBe(true)
    expect((await database.acquireWorkerLease(workerId, { schedulerId: scheduler, ttlSeconds: 60 })).changed).toBe(false)
    await expect(database.acquireWorkerLease(workerId, { schedulerId: "host-bridge:it:2", ttlSeconds: 60 })).rejects.toThrow(
      /held by/
    )

    await database.changeWorkerState(workerId, { detail: "", schedulerId: scheduler, state: "running" })
    await expect(database.changeWorkerState(workerId, { detail: "", schedulerId: null, state: "completed" })).rejects.toThrow(
      /held by/
    )
    await database.renewWorkerLease(workerId, { schedulerId: scheduler, ttlSeconds: 60 })
    await expect(database.releaseWorkerLease(workerId, { schedulerId: scheduler })).rejects.toThrow(/record its outcome/)
    await database.changeWorkerState(workerId, { detail: "done", schedulerId: scheduler, state: "completed" })
    expect((await database.releaseWorkerLease(workerId, { schedulerId: scheduler })).released).toBe(true)

    expect(await eventTypes(workerId)).toEqual([
      "worker.assigned",
      "worker.brief_recorded",
      "worker.lease_acquired",
      "worker.state_changed",
      "worker.lease_renewed",
      "worker.state_changed",
      "worker.lease_released"
    ])
    const unpublished = await raw`
      SELECT count(*)::int AS count FROM evergreen.events e
      LEFT JOIN evergreen.outbox o ON o.event_id = e.event_id
      WHERE e.aggregate_id = ${workerId} AND o.event_id IS NULL
    `
    expect(unpublished[0]?.count).toBe(0)
    const brief = await database.getWorkerBrief(workerId)
    expect(brief.prompt).toBe("Implement it.")
    const payloads = await raw`SELECT envelope::text AS envelope FROM evergreen.outbox WHERE envelope->'aggregate'->>'id' = ${workerId}`
    // Seven worker events were published; an empty match would make the leak check vacuous.
    expect(payloads).toHaveLength(7)
    expect(payloads.some((row: { envelope: string }) => row.envelope.includes("Implement it."))).toBe(false)
    const shapes = await raw`SELECT DISTINCT jsonb_typeof(envelope) AS shape FROM evergreen.outbox`
    expect(shapes.map((row: { shape: string }) => row.shape)).toEqual(["object"])
  })

  test("reconciling an expired lease fails an active worker and is never replayed", async () => {
    const workerId = await assign("crashed")
    await database.recordWorkerBrief(workerId, { prompt: "Crash midway." })
    await database.acquireWorkerLease(workerId, { schedulerId: "host-bridge:dead:1", ttlSeconds: 15 })
    await database.changeWorkerState(workerId, { detail: "", schedulerId: "host-bridge:dead:1", state: "running" })

    await expect(database.reconcileWorkerLease(workerId, { schedulerId: "host-bridge:it:2" })).rejects.toThrow(/still live/)
    await raw`UPDATE evergreen.workers SET lease_expires_at = now() - interval '1 second' WHERE id = ${workerId}`
    await expect(
      database.changeWorkerState(workerId, { detail: "", schedulerId: "host-bridge:dead:1", state: "completed" })
    ).rejects.toThrow(/expired/)

    const reconciled = await database.reconcileWorkerLease(workerId, { schedulerId: "host-bridge:it:2" })
    expect(reconciled).toEqual(expect.objectContaining({ reconciled: true, state: "failed" }))
    const worker = await database.getWorker(workerId)
    expect(worker.leaseOwner).toBeNull()
    expect(worker.stateDetail).toContain("not replayed")
    await expect(database.acquireWorkerLease(workerId, { schedulerId: "host-bridge:it:2", ttlSeconds: 60 })).rejects.toThrow(
      /assigned/
    )
    expect((await eventTypes(workerId)).slice(-2)).toEqual(["worker.lease_expired", "worker.state_changed"])
  })

  test("lists a goal's workers with brief and lease evidence", async () => {
    const workers = await database.listGoalWorkers(goalId)
    expect(workers.length).toBeGreaterThanOrEqual(2)
    expect(workers.every((worker) => worker.briefSha256?.length === 64)).toBe(true)
  })
})
