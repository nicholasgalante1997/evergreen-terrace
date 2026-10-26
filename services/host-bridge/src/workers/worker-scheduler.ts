/** @module Durable, lease-based, dependency-aware ACP worker scheduler. */

import { EventEmitter } from "node:events"
import type { CommandWorkerSnapshot } from "../command-api/command-api-client.types"
import { WorkerLeaseKeeper } from "./worker-lease-keeper"
import type {
  WorkerBriefEntry,
  WorkerExecutionPort,
  WorkerScheduleInput,
  WorkerScheduleOutcome,
  WorkerScheduleResult,
  WorkerScheduleStart,
  WorkerSchedulerCommandPort,
  WorkerSchedulerOptions
} from "./worker-scheduler.types"

const terminalFailureStates = new Set(["cancelled", "failed"])
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * Schedules a goal's assigned workers from durable command state.
 *
 * Briefs and leases live in the command API, so a schedule survives the MCP
 * request that started it and a bridge restart: `start` re-reads the goal,
 * reconciles expired leases, and launches only briefed `assigned` workers.
 * A worker is launched only after this scheduler acquires its lease, and is
 * never relaunched after its lease expires mid-session.
 */
export class WorkerScheduler extends EventEmitter {
  readonly #leased = new Set<string>()
  readonly #runs = new Map<string, Promise<WorkerScheduleResult>>()

  constructor(
    private readonly commandApi: WorkerSchedulerCommandPort,
    private readonly execution: WorkerExecutionPort,
    private readonly options: WorkerSchedulerOptions
  ) {
    super()
  }

  get schedulerId(): string {
    return this.options.schedulerId
  }

  activeGoalIds(): string[] {
    return [...this.#runs.keys()]
  }

  /** Persists one brief per worker; all workers must share one goal and project. */
  async recordBriefs(entries: readonly WorkerBriefEntry[]): Promise<string> {
    const workers = await Promise.all(entries.map((entry) => this.commandApi.getWorker(entry.workerId)))
    const [first] = workers
    if (first === undefined) {
      throw new Error("A schedule requires at least one worker")
    }
    if (workers.some((worker) => worker.goalId !== first.goalId || worker.projectId !== first.projectId)) {
      throw new Error("A schedule must contain workers for one goal in one project")
    }
    for (const entry of entries) {
      await this.commandApi.recordWorkerBrief(entry.workerId, entry.prompt)
    }
    return first.goalId
  }

  /** Starts in the background; a second start for an active goal queues behind it. */
  start(input: WorkerScheduleInput): WorkerScheduleStart {
    const active = this.#runs.get(input.goalId)
    const completion = (active === undefined ? this.run(input) : active.catch(() => undefined).then(() => this.run(input))).finally(
      () => {
        if (this.#runs.get(input.goalId) === completion) {
          this.#runs.delete(input.goalId)
        }
      }
    )
    this.#runs.set(input.goalId, completion)
    completion.catch((error: unknown) => this.emit("schedule:failed", { error, goalId: input.goalId }))
    return { alreadyRunning: active !== undefined, completion, goalId: input.goalId, schedulerId: this.schedulerId }
  }

  async run(input: WorkerScheduleInput): Promise<WorkerScheduleResult> {
    const workers = await this.reconcileExpiredLeases(await this.loadSchedule(input))
    const outcomes = new Map<string, WorkerScheduleOutcome>()
    const pending = new Map<string, CommandWorkerSnapshot>()
    for (const worker of workers) {
      const settled = this.settledOutcome(worker)
      if (settled === undefined) {
        pending.set(worker.id, worker)
      } else {
        outcomes.set(worker.id, settled)
      }
    }
    const active = new Map<string, Promise<void>>()

    while (pending.size > 0 || active.size > 0) {
      const ready: CommandWorkerSnapshot[] = []
      for (const worker of pending.values()) {
        const dependencies = await this.inspectDependencies(worker)
        if (dependencies.kind === "failed") {
          outcomes.set(worker.id, await this.failForDependency(worker.id, dependencies.workerId, dependencies.state))
          pending.delete(worker.id)
        } else if (dependencies.kind === "ready") {
          ready.push(worker)
        }
      }

      while (active.size < input.maxConcurrency && ready.length > 0) {
        const worker = ready.shift()
        if (worker !== undefined && pending.delete(worker.id)) {
          active.set(
            worker.id,
            this.launch(worker)
              .then((outcome) => void outcomes.set(worker.id, outcome))
              .finally(() => active.delete(worker.id))
          )
        }
      }

      if (active.size === 0) {
        for (const worker of pending.values()) {
          outcomes.set(worker.id, {
            detail: "Blocked until dependencies complete; no runnable worker in this schedule can advance the graph.",
            state: "blocked",
            workerId: worker.id
          })
          this.emit("worker:blocked", { workerId: worker.id })
        }
        break
      }

      await Promise.race(active.values())
    }

    return {
      goalId: input.goalId,
      outcomes: workers.map(
        (worker) =>
          outcomes.get(worker.id) ?? { detail: "Worker did not receive a schedule outcome.", state: "blocked", workerId: worker.id }
      ),
      schedulerId: this.schedulerId
    }
  }

  private async loadSchedule(input: WorkerScheduleInput): Promise<CommandWorkerSnapshot[]> {
    const workers = await this.commandApi.listGoalWorkers(input.goalId)
    if (input.workerIds === undefined) {
      return workers
    }
    const known = new Set(workers.map((worker) => worker.id))
    const missing = input.workerIds.find((workerId) => !known.has(workerId))
    if (missing !== undefined) {
      throw new Error(`Worker ${missing} does not belong to goal ${input.goalId}`)
    }
    const wanted = new Set(input.workerIds)
    return workers.filter((worker) => wanted.has(worker.id))
  }

  /** Expired leases from another scheduler are reconciled durably before planning. */
  private async reconcileExpiredLeases(workers: CommandWorkerSnapshot[]): Promise<CommandWorkerSnapshot[]> {
    const now = Date.now()
    return Promise.all(
      workers.map(async (worker) => {
        if (
          worker.leaseOwner === null ||
          worker.leaseExpiresAt === null ||
          worker.leaseOwner === this.schedulerId ||
          Date.parse(worker.leaseExpiresAt) > now
        ) {
          return worker
        }
        try {
          const result = await this.commandApi.reconcileWorkerLease(worker.id, this.schedulerId)
          this.emit("lease:reconciled", { previousOwner: worker.leaseOwner, state: result.state, workerId: worker.id })
        } catch (error) {
          this.emit("lease:reconcile_failed", { error, workerId: worker.id })
        }
        return this.commandApi.getWorker(worker.id)
      })
    )
  }

  private settledOutcome(worker: CommandWorkerSnapshot): WorkerScheduleOutcome | undefined {
    if (worker.state === "completed") {
      return { detail: "Recovered completed worker; no ACP session was started.", state: "completed", workerId: worker.id }
    }
    if (terminalFailureStates.has(worker.state)) {
      return { detail: `Recovered terminal worker state: ${worker.state}.`, state: "failed", workerId: worker.id }
    }
    if (worker.state === "running" || worker.state === "awaiting_decision") {
      const holder = worker.leaseOwner === null ? "no lease (legacy, unprovable liveness)" : `lease held by ${worker.leaseOwner}`
      return {
        detail: `Worker remains ${worker.state} with ${holder}; a second ACP session will not be started.`,
        state: "blocked",
        workerId: worker.id
      }
    }
    if (worker.briefSha256 === null) {
      return {
        detail: "No durable brief is recorded; submit one through evergreen.worker_pool.run or evergreen.worker.run.",
        state: "blocked",
        workerId: worker.id
      }
    }
    return undefined
  }

  private async inspectDependencies(
    worker: CommandWorkerSnapshot
  ): Promise<{ kind: "ready" } | { kind: "waiting" } | { kind: "failed"; state: string; workerId: string }> {
    if (worker.dependsOnWorkerIds.length === 0) {
      return { kind: "ready" }
    }
    const dependencies = await Promise.all(worker.dependsOnWorkerIds.map((workerId) => this.commandApi.getWorker(workerId)))
    const terminal = dependencies.find((dependency) => terminalFailureStates.has(dependency.state))
    if (terminal !== undefined) {
      return { kind: "failed", state: terminal.state, workerId: terminal.id }
    }
    return dependencies.every((dependency) => dependency.state === "completed") ? { kind: "ready" } : { kind: "waiting" }
  }

  private async failForDependency(workerId: string, dependencyId: string, state: string): Promise<WorkerScheduleOutcome> {
    const detail = `Not started because dependency ${dependencyId} ended ${state}.`
    try {
      await this.commandApi.changeWorkerState(workerId, { detail, state: "failed" })
      this.emit("worker:dependency_failed", { dependency: dependencyId, workerId })
      return { detail, state: "failed", workerId }
    } catch (error) {
      return { detail: `Dependency ${dependencyId} ended ${state}, but recording failure was refused: ${message(error)}`, state: "blocked", workerId }
    }
  }

  private async launch(worker: CommandWorkerSnapshot): Promise<WorkerScheduleOutcome> {
    if (this.#leased.has(worker.id)) {
      return { detail: "This scheduler already holds an active session for the worker.", state: "blocked", workerId: worker.id }
    }
    this.#leased.add(worker.id)
    try {
      return await this.launchLeased(worker)
    } finally {
      this.#leased.delete(worker.id)
    }
  }

  private async launchLeased(worker: CommandWorkerSnapshot): Promise<WorkerScheduleOutcome> {
    const workerId = worker.id
    try {
      const lease = await this.commandApi.acquireWorkerLease(workerId, this.schedulerId, this.options.leaseTtlSeconds)
      if (!lease.changed) {
        return { detail: "Lease is already held by this scheduler; no second session was started.", state: "blocked", workerId }
      }
    } catch (error) {
      return { detail: `Lease unavailable: ${message(error)}`, state: "blocked", workerId }
    }
    this.emit("lease:acquired", { workerId })

    const keeper = new WorkerLeaseKeeper(
      this.commandApi,
      workerId,
      this.schedulerId,
      this.options.leaseTtlSeconds,
      this.options.renewIntervalMs
    )
    keeper.on("lease:lost", (event) => this.emit("lease:lost", event))
    try {
      const brief = await this.commandApi.getWorkerBrief(workerId)
      keeper.start()
      this.emit("worker:started", { workerId })
      await this.execution.execute({
        adapter: worker.adapter,
        artifactDirectory: worker.worktree.artifactDirectory,
        goalId: worker.goalId,
        projectId: worker.projectId,
        prompt: brief.prompt,
        role: worker.role,
        schedulerId: this.schedulerId,
        signal: keeper.signal,
        workerId,
        worktreePath: worker.worktree.worktreePath
      })
    } catch (error) {
      this.emit("worker:failed", { error, workerId })
    } finally {
      keeper.stop()
    }
    return this.finish(workerId)
  }

  /** Reports durable state, then releases this scheduler's lease if the worker settled. */
  private async finish(workerId: string): Promise<WorkerScheduleOutcome> {
    const final = await this.commandApi.getWorker(workerId)
    try {
      await this.commandApi.releaseWorkerLease(workerId, this.schedulerId)
    } catch (error) {
      this.emit("lease:release_failed", { error, workerId })
    }
    if (final.state === "completed") {
      this.emit("worker:completed", { workerId })
      return { detail: "ACP worker session completed.", state: "completed", workerId }
    }
    if (terminalFailureStates.has(final.state)) {
      return { detail: "ACP worker session failed. Consult the worker artifact result for details.", state: "failed", workerId }
    }
    return {
      detail: `Worker is ${final.state} after its session ended; its lease will expire and be reconciled.`,
      state: "blocked",
      workerId
    }
  }
}
