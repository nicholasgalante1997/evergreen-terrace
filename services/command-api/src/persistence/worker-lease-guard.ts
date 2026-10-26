/** @module Pure lease rules that gate worker lifecycle transitions. */

import type { WorkerState, WorkerStateChange } from "@evergreen-terrace/contracts"

interface LeasedWorker {
  leaseExpiresAt: Date | null
  leaseOwner: string | null
  state: WorkerState
}

const activeStates: ReadonlySet<WorkerState> = new Set(["running", "awaiting_decision"])

export const isLeaseLive = (worker: LeasedWorker, now: Date): boolean =>
  worker.leaseOwner !== null && worker.leaseExpiresAt !== null && worker.leaseExpiresAt > now

/**
 * Returns a refusal reason, or null when the transition is allowed.
 *
 * - Launch (`assigned -> running`) requires a live lease owned by the caller.
 * - While a lease is live, only its owner may move the worker, except for an
 *   engineer `cancelled` stop.
 * - After a lease expires on an active worker, only `failed`/`cancelled` are
 *   accepted; anything else must wait for reconciliation.
 */
export const leaseTransitionRefusal = (worker: LeasedWorker, change: WorkerStateChange, now: Date): string | null => {
  const live = isLeaseLive(worker, now)
  if (worker.state === "assigned" && change.state === "running") {
    return live && worker.leaseOwner === change.schedulerId
      ? null
      : "Launching a worker requires a live lease held by the requesting scheduler"
  }
  if (live && change.state !== "cancelled" && change.schedulerId !== worker.leaseOwner) {
    return `Worker lease is held by ${String(worker.leaseOwner)}`
  }
  if (
    !live &&
    worker.leaseOwner !== null &&
    activeStates.has(worker.state) &&
    change.state !== "failed" &&
    change.state !== "cancelled"
  ) {
    return "Worker lease expired; reconcile the lease before continuing"
  }
  return null
}
