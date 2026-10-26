/** @module Merge-order and overlap analysis tests. */

import { expect, test } from "bun:test"
import { changedFileOverlaps, mergeOrder } from "./integration-plan"

test("orders prerequisites first and keeps assignment order for independent workers", () => {
  expect(
    mergeOrder([
      { dependsOnWorkerIds: ["b"], id: "c" },
      { dependsOnWorkerIds: [], id: "a" },
      { dependsOnWorkerIds: ["a"], id: "b" },
      { dependsOnWorkerIds: ["outside"], id: "d" }
    ])
  ).toEqual(["a", "b", "c", "d"])
})

test("rejects a cyclic graph instead of guessing an order", () => {
  expect(() =>
    mergeOrder([
      { dependsOnWorkerIds: ["b"], id: "a" },
      { dependsOnWorkerIds: ["a"], id: "b" }
    ])
  ).toThrow("cycle")
})

test("reports only files touched by more than one source", () => {
  expect(
    changedFileOverlaps([
      { changedFiles: ["src/a.ts", "src/shared.ts"], workerId: "w1" },
      { changedFiles: ["src/b.ts", "src/shared.ts"], workerId: "w2" },
      { changedFiles: ["src/shared.ts", "src/a.ts"], workerId: "w3" }
    ])
  ).toEqual([
    { path: "src/a.ts", workerIds: ["w1", "w3"] },
    { path: "src/shared.ts", workerIds: ["w1", "w2", "w3"] }
  ])
})
