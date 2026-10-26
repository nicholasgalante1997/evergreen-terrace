/** @module Worker-state transition guard tests. */

import { expect, test } from "bun:test"
import { canTransitionWorkerState } from "./worker-state-transition"

test("permits only the worker lifecycle graph", () => {
  expect(canTransitionWorkerState("assigned", "running")).toBe(true)
  expect(canTransitionWorkerState("running", "awaiting_decision")).toBe(true)
  expect(canTransitionWorkerState("awaiting_decision", "running")).toBe(true)
  expect(canTransitionWorkerState("running", "completed")).toBe(true)
  expect(canTransitionWorkerState("completed", "running")).toBe(false)
  expect(canTransitionWorkerState("assigned", "completed")).toBe(false)
})
