/** @module MCP HTTP transport route and session tests. */

import { expect, test } from "bun:test"
import { McpServer, McpToolRegistry } from "@evergreen-terrace/mcp-core"
import { McpHttpServer } from "./http-server"

const server = (): McpHttpServer =>
  new McpHttpServer({
    mcp: new McpServer({ serverInfo: { name: "test", version: "0.0.0" }, tools: new McpToolRegistry() }),
    port: 0
  })

test("routes initialize and explicit session termination through the HTTP registry", async () => {
  const transport = server()
  const initialized = await transport.respond(
    new Request("http://bridge/mcp", {
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "initialize", params: { protocolVersion: "2025-06-18" } }),
      headers: { "content-type": "application/json" },
      method: "POST"
    })
  )
  const sessionId = initialized.headers.get("mcp-session-id")
  const payload = (await initialized.json()) as { result: { protocolVersion: string } }

  expect(initialized.status).toBe(200)
  expect(sessionId).toBeString()
  expect(payload.result.protocolVersion).toBe("2025-06-18")
  expect(
    (await transport.respond(new Request("http://bridge/mcp", { headers: { "mcp-session-id": sessionId! }, method: "DELETE" }))).status
  ).toBe(204)
})

test("retains method and unmatched-path failures", async () => {
  const transport = server()

  expect((await transport.respond(new Request("http://bridge/mcp", { method: "GET" }))).status).toBe(405)
  expect((await transport.respond(new Request("http://bridge/other", { method: "POST" }))).status).toBe(404)
})
