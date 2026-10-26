/** @module Periodic worker-lease renewal bound to one ACP session. */

import { EventEmitter } from "node:events"
import type { WorkerLeaseRenewalPort } from "./worker-scheduler.types"

/**
 * Renews a lease at a third of its TTL. A failed renewal aborts the session:
 * an ACP process must never keep running once its lease cannot be proven.
 */
export class WorkerLeaseKeeper extends EventEmitter {
  readonly #controller = new AbortController()
  #renewing = false
  #timer: ReturnType<typeof setInterval> | undefined

  constructor(
    private readonly commandApi: WorkerLeaseRenewalPort,
    private readonly workerId: string,
    private readonly schedulerId: string,
    private readonly ttlSeconds: number,
    private readonly intervalMs: number = Math.floor((ttlSeconds * 1_000) / 3)
  ) {
    super()
  }

  get signal(): AbortSignal {
    return this.#controller.signal
  }

  start(): void {
    this.#timer ??= setInterval(() => void this.renew(), this.intervalMs)
  }

  stop(): void {
    clearInterval(this.#timer)
    this.#timer = undefined
  }

  private async renew(): Promise<void> {
    if (this.#renewing || this.#timer === undefined) {
      return
    }
    this.#renewing = true
    try {
      await this.commandApi.renewWorkerLease(this.workerId, this.schedulerId, this.ttlSeconds)
      this.emit("lease:renewed", { workerId: this.workerId })
    } catch (error) {
      this.stop()
      this.emit("lease:lost", { error, workerId: this.workerId })
      this.#controller.abort(new Error(`Lease renewal failed for worker ${this.workerId}`))
    } finally {
      this.#renewing = false
    }
  }
}
