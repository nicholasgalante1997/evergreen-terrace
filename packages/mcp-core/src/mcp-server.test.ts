/** @module MCP request-dispatcher tests. */

import { expect, test } from "bun:test"
import { McpServer } from "./mcp-server"
import { McpToolRegistry } from "./mcp-tool-registry"

test("McpServer initializes, lists registered tools, and dispatches tool calls", async () => {
  const tools = new McpToolRegistry().register({
    definition: {
      description: "Returns its input.",
      inputSchema: { type: "object" },
      name: "evergreen.echo"
    },
    invoke: async (argumentsValue) => ({ content: [{ text: JSON.stringify(argumentsValue), type: "text" }] })
  })
  const server = new McpServer({ serverInfo: { name: "test", version: "0.0.0" }, tools })
  const session = server.createSession()

  const initialized = await server.dispatch(
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    session
  )
  expect(initialized).toMatchObject({ result: { protocolVersion: "2025-06-18" } })

  const listed = await server.dispatch({ jsonrpc: "2.0", id: 2, method: "tools/list" }, session)
  expect(listed).toMatchObject({ result: { tools: [{ name: "evergreen.echo" }] } })

  const called = await server.dispatch(
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "evergreen.echo", arguments: { ok: true } } },
    session
  )
  expect(called).toMatchObject({ result: { content: [{ text: '{"ok":true}' }] } })
})
