/** @module Console request-guard tests: DNS rebinding and cross-site actions are refused. */

import { expect, test } from "bun:test"
import { allowedHosts, guardRequest } from "./request-guard"

const hosts = allowedHosts(7460)
const request = (method: string, headers: Record<string, string>) =>
  new Request("http://127.0.0.1:7460/api/x", { headers, method })

test("reads need only an allowed Host", () => {
  expect(guardRequest(request("GET", { host: "127.0.0.1:7460" }), hosts)).toBeNull()
  expect(guardRequest(request("GET", { host: "localhost:7460" }), hosts)).toBeNull()
  expect(guardRequest(request("GET", { host: "attacker.example:7460" }), hosts)?.status).toBe(421)
})

test("actions need the console's own origin, JSON, and the action header", () => {
  const valid = {
    "content-type": "application/json",
    host: "127.0.0.1:7460",
    origin: "http://127.0.0.1:7460",
    "x-evergreen-console": "1"
  }
  expect(guardRequest(request("POST", valid), hosts)).toBeNull()
  expect(guardRequest(request("POST", { ...valid, origin: "http://attacker.example" }), hosts)?.status).toBe(403)
  expect(guardRequest(request("POST", { ...valid, "x-evergreen-console": "" }), hosts)?.status).toBe(403)
  expect(guardRequest(request("POST", { ...valid, "content-type": "text/plain" }), hosts)?.status).toBe(403)
})
