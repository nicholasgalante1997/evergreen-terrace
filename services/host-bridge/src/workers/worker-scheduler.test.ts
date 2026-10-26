/** @module Durable lease-based worker-scheduler tests. */

import { expect, test } from "bun:test"
import type { CommandWorkerSnapshot } from "../command-api/command-api-client.types"
import { WorkerScheduler } from "./worker-scheduler"
import type { WorkerExecutionPort, WorkerSchedulerCommandPort } from "./worker-scheduler.types"

const goalId = "44444444-4444-4444-8444-444444444444"
const ids = {
  child: "11111111-1111-4111-8111-111111111111",
  independent: "22222222-2222-4222-8222-222222222222",
  root: "33333333-3333-4333-8333-333333333333"
}

const snapshot = (id: string, dependsOnWorkerIds: string[] = []): CommandWorkerSnapshot => ({
  adapter: "claude",
  briefSha256: null,
  dependsOnWorkerIds,
  goalId,
  id,
  leaseExpiresAt: null,
  leaseOwner: null,
  projectId: "github.com/example/evergreen",
  role: `role-${id.slice(0, 4)}`,
  state: "assigned",
  worktree: {
    artifactDirectory: `/tmp/${id}/artifacts`,
    attempt: 1,
    baseRef: "main",
    baseSha: "a".repeat(40),
    branch: `feature/${id}`,
    manifestPath: `/tmp/${id}/manifest.json`,
    worktreePath: `/tmp/${id}/worktree`
  }
})

/** In-memory command API that enforces the same lease rules as the command service. */
class FakeCommandApi implements WorkerSchedulerCommandPort {
  readonly briefs = new Map<string, string>()
  readonly leaseLog: string[] = []
  readonly workers: Map<string, CommandWorkerSnapshot>

  constructor(workers: CommandWorkerSnapshot[]) {
    this.workers = new Map(workers.map((worker) => [worker.id, worker]))
  }

  worker(workerId: string): CommandWorkerSnapshot {
    const worker = this.workers.get(workerId)
    if (worker === undefined) {
      throw new Error(`unknown worker ${workerId}`)
    }
    return worker
  }

  async acquireWorkerLease(workerId: string, schedulerId: string, ttlSeconds: number) {
    const worker = this.worker(workerId)
    const live = worker.leaseExpiresAt !== null && Date.parse(worker.leaseExpiresAt) > Date.now()
    if (live && worker.leaseOwner !== schedulerId) {
      throw new Error(`lease held by ${worker.leaseOwner}`)
    }
    if (worker.state !== "assigned" || worker.briefSha256 === null) {
      throw new Error("not leasable")
    }
    worker.leaseOwner = schedulerId
    worker.leaseExpiresAt = new Date(Date.now() + ttlSeconds * 1_000).toISOString()
    this.leaseLog.push(`acquire:${workerId}`)
    return { changed: !live, leaseExpiresAt: worker.leaseExpiresAt, leaseOwner: schedulerId, workerId }
  }

  async renewWorkerLease(workerId: string, schedulerId: string, ttlSeconds: number) {
    const worker = this.worker(workerId)
    if (worker.leaseOwner !== schedulerId) {
      throw new Error("not the lease owner")
    }
    worker.leaseExpiresAt = new Date(Date.now() + ttlSeconds * 1_000).toISOString()
    this.leaseLog.push(`renew:${workerId}`)
    return { changed: true, leaseExpiresAt: worker.leaseExpiresAt, leaseOwner: schedulerId, workerId }
  }

  async releaseWorkerLease(workerId: string, schedulerId: string) {
    const worker = this.worker(workerId)
    if (worker.leaseOwner !== schedulerId || worker.state === "running" || worker.state === "awaiting_decision") {
      throw new Error("release refused")
    }
    worker.leaseOwner = null
    worker.leaseExpiresAt = null
    this.leaseLog.push(`release:${workerId}`)
  }

  async reconcileWorkerLease(workerId: string, schedulerId: string) {
    const worker = this.worker(workerId)
    this.leaseLog.push(`reconcile:${workerId}:${schedulerId}`)
    worker.leaseOwner = null
    worker.leaseExpiresAt = null
    if (worker.state === "running" || worker.state === "awaiting_decision") {
      worker.state = "failed"
    }
    return { reconciled: true, state: worker.state, workerId }
  }

  async changeWorkerState(workerId: string, input: { detail: string; state: "failed" }) {
    this.worker(workerId).state = input.state
    return { eventId: crypto.randomUUID(), state: input.state, transitioned: true, workerId }
  }

  async getWorker(workerId: string) {
    return { ...this.worker(workerId) }
  }

  async getWorkerBrief(workerId: string) {
    const prompt = this.briefs.get(workerId)
    if (prompt === undefined) {
      throw new Error("no brief")
    }
    return { prompt, sha256: "f".repeat(64), workerId }
  }

  async listGoalWorkers(requestedGoalId: string) {
    return [...this.workers.values()].filter((worker) => worker.goalId === requestedGoalId).map((worker) => ({ ...worker }))
  }

  async recordWorkerBrief(workerId: string, prompt: string) {
    this.briefs.set(workerId, prompt)
    this.worker(workerId).briefSha256 = "f".repeat(64)
    return { briefSha256: "f".repeat(64), eventId: crypto.randomUUID(), recorded: true, workerId }
  }
}

/** Execution that mirrors WorkerExecutionService state changes against the fake. */
const execution = (api: FakeCommandApi, onRun: (workerId: string, prompt: string) => Promise<void> = async () => undefined) => {
  const started: string[] = []
  const port: WorkerExecutionPort = {
    execute: async (input) => {
      const worker = api.worker(input.workerId)
      if (worker.leaseOwner !== input.schedulerId) {
        throw new Error("launch without lease")
      }
      worker.state = "running"
      started.push(input.workerId)
      try {
        await onRun(input.workerId, input.prompt)
        worker.state = "completed"
      } catch (error) {
        worker.state = "failed"
        throw error
      }
      return { result: {} as never, workerId: input.workerId }
    }
  }
  return { port, started }
}

const options = { leaseTtlSeconds: 60, schedulerId: "host-bridge:test:1" }

test("launches only from durable briefs, under a lease, honoring dependencies", async () => {
  const api = new FakeCommandApi([snapshot(ids.root), snapshot(ids.child, [ids.root]), snapshot(ids.independent)])
  const prompts = new Map<string, string>()
  const run = execution(api, async (workerId, prompt) => void prompts.set(workerId, prompt))
  const scheduler = new WorkerScheduler(api, run.port, options)

  await scheduler.recordBriefs([
    { prompt: "Complete the prerequisite.", workerId: ids.root },
    { prompt: "Use the prerequisite output.", workerId: ids.child },
    { prompt: "Work independently.", workerId: ids.independent }
  ])
  const result = await scheduler.run({ goalId, maxConcurrency: 2 })

  expect(result.outcomes.map((outcome) => outcome.state)).toEqual(["completed", "completed", "completed"])
  expect(run.started.indexOf(ids.child)).toBeGreaterThan(run.started.indexOf(ids.root))
  expect(prompts.get(ids.child)).toBe("Use the prerequisite output.")
  expect(api.leaseLog.filter((entry) => entry.startsWith("release:"))).toHaveLength(3)
  expect([...api.workers.values()].every((worker) => worker.leaseOwner === null)).toBe(true)
})

test("does not launch a worker without a durable brief", async () => {
  const api = new FakeCommandApi([snapshot(ids.root)])
  const run = execution(api)
  const result = await new WorkerScheduler(api, run.port, options).run({ goalId, maxConcurrency: 1 })

  expect(result.outcomes[0]?.state).toBe("blocked")
  expect(run.started).toHaveLength(0)
})

test("fails dependents of a failed prerequisite without starting them", async () => {
  const api = new FakeCommandApi([{ ...snapshot(ids.root), state: "failed" }, snapshot(ids.child, [ids.root])])
  const run = execution(api)
  const scheduler = new WorkerScheduler(api, run.port, options)
  await scheduler.recordBriefs([{ prompt: "Needs the prerequisite.", workerId: ids.child }])

  const result = await scheduler.run({ goalId, maxConcurrency: 1, workerIds: [ids.child] })

  expect(result.outcomes).toEqual([expect.objectContaining({ state: "failed", workerId: ids.child })])
  expect(run.started).toHaveLength(0)
})

test("reconciles another scheduler's expired lease and never replays the session", async () => {
  const crashed = {
    ...snapshot(ids.root),
    briefSha256: "f".repeat(64),
    leaseExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    leaseOwner: "host-bridge:crashed:9",
    state: "running" as const
  }
  const api = new FakeCommandApi([crashed])
  api.briefs.set(ids.root, "Original brief.")
  const run = execution(api)

  const result = await new WorkerScheduler(api, run.port, options).run({ goalId, maxConcurrency: 1 })

  expect(api.leaseLog).toContain(`reconcile:${ids.root}:${options.schedulerId}`)
  expect(result.outcomes[0]?.state).toBe("failed")
  expect(run.started).toHaveLength(0)
})

test("treats a live foreign lease as blocked rather than starting a duplicate session", async () => {
  const live = {
    ...snapshot(ids.root),
    briefSha256: "f".repeat(64),
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    leaseOwner: "host-bridge:other:2",
    state: "awaiting_decision" as const
  }
  const api = new FakeCommandApi([live])
  const run = execution(api)

  const result = await new WorkerScheduler(api, run.port, options).run({ goalId, maxConcurrency: 1 })

  expect(result.outcomes[0]).toEqual(expect.objectContaining({ state: "blocked" }))
  expect(api.leaseLog).toHaveLength(0)
  expect(run.started).toHaveLength(0)
})

test("renews while a session runs and aborts it when renewal is refused", async () => {
  const api = new FakeCommandApi([snapshot(ids.root)])
  let renewals = 0
  api.renewWorkerLease = async () => {
    renewals += 1
    throw new Error("lease expired")
  }
  let aborted = false
  const scheduler = new WorkerScheduler(
    api,
    {
      execute: async (input) => {
        api.worker(input.workerId).state = "running"
        await new Promise<void>((resolve) => {
          input.signal?.addEventListener("abort", () => {
            aborted = true
            resolve()
          })
        })
        api.worker(input.workerId).state = "failed"
        throw new Error("aborted")
      }
    },
    { ...options, renewIntervalMs: 10 }
  )
  await scheduler.recordBriefs([{ prompt: "Long running work.", workerId: ids.root }])

  const result = await scheduler.run({ goalId, maxConcurrency: 1 })

  expect(renewals).toBe(1)
  expect(aborted).toBe(true)
  expect(result.outcomes[0]?.state).toBe("failed")
})

test("serializes a second start for the same goal behind the active run", async () => {
  const api = new FakeCommandApi([snapshot(ids.root)])
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => (release = resolve))
  const run = execution(api, () => gate)
  const scheduler = new WorkerScheduler(api, run.port, options)
  await scheduler.recordBriefs([{ prompt: "Only once.", workerId: ids.root }])

  const first = scheduler.start({ goalId, maxConcurrency: 1 })
  const second = scheduler.start({ goalId, maxConcurrency: 1 })
  expect(second.alreadyRunning).toBe(true)
  expect(scheduler.activeGoalIds()).toEqual([goalId])
  release()

  expect((await first.completion).outcomes[0]?.state).toBe("completed")
  expect((await second.completion).outcomes[0]?.detail).toContain("Recovered completed worker")
  expect(run.started).toEqual([ids.root])
  expect(scheduler.activeGoalIds()).toEqual([])
})
