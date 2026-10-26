/** @module Worker lease transition-guard tests. */

import { expect, test } from "bun:test"
import { leaseTransitionRefusal } from "./worker-lease-guard"

const now = new Date("2026-10-25T12:00:00.000Z")
const future = new Date("2026-10-25T12:01:00.000Z")
const past = new Date("2026-10-25T11:59:00.000Z")

test("launch requires a live lease owned by the requesting scheduler", () => {
  const assigned = { leaseExpiresAt: future, leaseOwner: "sched-a", state: "assigned" as const }
  expect(leaseTransitionRefusal(assigned, { detail: "", schedulerId: "sched-a", state: "running" }, now)).toBeNull()
  expect(leaseTransitionRefusal(assigned, { detail: "", schedulerId: "sched-b", state: "running" }, now)).not.toBeNull()
  expect(
    leaseTransitionRefusal({ ...assigned, leaseExpiresAt: past }, { detail: "", schedulerId: "sched-a", state: "running" }, now)
  ).not.toBeNull()
  expect(
    leaseTransitionRefusal(
      { leaseExpiresAt: null, leaseOwner: null, state: "assigned" },
      { detail: "", schedulerId: null, state: "running" },
      now
    )
  ).not.toBeNull()
})

test("only the lease owner moves a leased worker, except an engineer cancel", () => {
  const running = { leaseExpiresAt: future, leaseOwner: "sched-a", state: "running" as const }
  expect(leaseTransitionRefusal(running, { detail: "", schedulerId: "sched-a", state: "completed" }, now)).toBeNull()
  expect(leaseTransitionRefusal(running, { detail: "", schedulerId: null, state: "completed" }, now)).not.toBeNull()
  expect(leaseTransitionRefusal(running, { detail: "", schedulerId: null, state: "cancelled" }, now)).toBeNull()
})

test("an expired lease on an active worker accepts only failure or cancellation", () => {
  const stale = { leaseExpiresAt: past, leaseOwner: "sched-a", state: "running" as const }
  expect(leaseTransitionRefusal(stale, { detail: "", schedulerId: "sched-a", state: "completed" }, now)).not.toBeNull()
  expect(leaseTransitionRefusal(stale, { detail: "", schedulerId: "sched-a", state: "failed" }, now)).toBeNull()
})

test("unleased dependency failure of an assigned worker remains allowed", () => {
  const assigned = { leaseExpiresAt: null, leaseOwner: null, state: "assigned" as const }
  expect(leaseTransitionRefusal(assigned, { detail: "", schedulerId: null, state: "failed" }, now)).toBeNull()
})
