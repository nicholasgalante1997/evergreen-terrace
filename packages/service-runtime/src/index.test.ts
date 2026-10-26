/** @module Service-runtime configuration tests. */

import { expect, test } from "bun:test"
import { readPort } from "./config"

test("readPort accepts configured ports and rejects invalid input", () => {
  expect(readPort(undefined, 7410)).toBe(7410)
  expect(readPort("7420", 7410)).toBe(7420)
  expect(() => readPort("0", 7410)).toThrow("Port must be")
  expect(() => readPort("not-a-port", 7410)).toThrow("Port must be")
})
