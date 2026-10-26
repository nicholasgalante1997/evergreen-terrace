/** @module Immutable worker-state transition guard. */

import type { WorkerState } from "@evergreen-terrace/contracts"

const transitions: Readonly<Record<WorkerState, ReadonlySet<WorkerState>>> = {
  assigned: new Set(["running", "failed", "cancelled"]),
  awaiting_decision: new Set(["running", "failed", "cancelled"]),
  cancelled: new Set(),
  completed: new Set(),
  failed: new Set(),
  running: new Set(["awaiting_decision", "completed", "failed", "cancelled"])
}

export const canTransitionWorkerState = (from: WorkerState, to: WorkerState): boolean => transitions[from].has(to)
