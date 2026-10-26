/** @module Read-only planning-session permission tests: reads pass, nothing else does, and no card is ever raised. */

import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ReadOnlyPermissionResolver } from "./read-only-permission-resolver"

const options = [
  { kind: "allow_once", name: "Allow", optionId: "allow" },
  { kind: "reject_once", name: "Reject", optionId: "reject" }
]
let checkout = ""

beforeAll(async () => {
  checkout = await mkdtemp(join(tmpdir(), "et-ro-"))
  await mkdir(join(checkout, "src"))
  await Bun.write(join(checkout, "src", "a.ts"), "export {}\n")
})

afterAll(async () => {
  await rm(checkout, { force: true, recursive: true })
})

const request = (kind: string, extra: Record<string, unknown> = {}) => ({
  options,
  sessionId: "s",
  toolCall: { kind, toolCallId: "t", ...extra }
})

test("allows reads inside the checkout and confined read-only commands", async () => {
  const resolver = new ReadOnlyPermissionResolver(checkout)
  expect(await resolver.resolve(request("read", { locations: [{ path: join(checkout, "src", "a.ts") }] }))).toMatchObject(
    {
      granted: true,
      rule: "read_only:read"
    }
  )
  expect(await resolver.resolve(request("execute", { rawInput: { command: "git log --oneline -n 3" } }))).toMatchObject({
    granted: true,
    rule: "read_only:git-log"
  })
})

test.each([
  ["an edit", request("edit", { locations: [{ path: "src/a.ts" }] })],
  ["a read outside the checkout", request("read", { locations: [{ path: "/etc/hostname" }] })],
  ["a fetch", request("fetch", { rawInput: { url: "https://example.com" } })],
  ["a test run", request("execute", { rawInput: { command: "bun test" } })],
  ["a write command", request("execute", { rawInput: { command: "rm -rf src" } })]
])("rejects %s without asking the engineer", async (_name, params) => {
  const resolution = await new ReadOnlyPermissionResolver(checkout).resolve(params)
  expect(resolution).toEqual({
    granted: false,
    response: { outcome: { optionId: "reject", outcome: "selected" } },
    rule: "read_only_session",
    via: "policy"
  })
})
