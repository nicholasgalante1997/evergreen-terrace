/** @module Console route tests: snapshots come from the read API, actions go only through the bridge. */

import { expect, test } from "bun:test"
import { BridgeClient } from "../bridge/bridge-client"
import { ConsoleServer } from "./console-server"
import { consoleRoutes } from "./console-routes"

/** A fake host bridge speaking just enough MCP-over-HTTP for one tool call. */
const fakeBridge = (calls: unknown[], fail = false) =>
  Bun.serve({
    fetch: async (request) => {
      if (request.method === "DELETE") {
        return new Response(null, { status: 204 })
      }
      const body = (await request.json()) as { id?: number; method: string; params?: unknown }
      if (body.method === "initialize") {
        return Response.json({ id: body.id, jsonrpc: "2.0", result: {} }, { headers: { "mcp-session-id": "s1" } })
      }
      if (body.method === "tools/call") {
        calls.push(body.params)
        return Response.json({
          id: body.id,
          jsonrpc: "2.0",
          result: fail
            ? { content: [{ text: "Decision already resolved", type: "text" }], isError: true }
            : { content: [{ text: "{}", type: "text" }], structuredContent: { resolved: true } }
        })
      }
      return new Response(null, { status: 202 })
    },
    hostname: "127.0.0.1",
    port: 0
  })

const server = (bridgeUrl: string) =>
  new ConsoleServer({
    port: 7460,
    routes: consoleRoutes({
      assetsDirectory: "/nonexistent",
      bridge: new BridgeClient(bridgeUrl),
      pollIntervalMs: 50,
      readApi: {
        freshness: async () => null,
        snapshot: async () => ({
          decisions: [],
          events: [],
          freshness: null,
          goals: [],
          handoffs: [],
          integrations: [],
          onboardings: [],
          plans: [],
          preferences: [],
          readAt: "now",
          validations: [],
          workers: []
        })
      }
    })
  })

const action = (path: string, body: unknown) =>
  new Request(`http://127.0.0.1:7460${path}`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      host: "127.0.0.1:7460",
      origin: "http://127.0.0.1:7460",
      "x-evergreen-console": "1"
    },
    method: "POST"
  })

test("a resolution is forwarded to evergreen.decision.resolve through the bridge", async () => {
  const calls: unknown[] = []
  const bridge = fakeBridge(calls)
  const response = await server(`http://127.0.0.1:${bridge.port}/mcp`).respond(
    action("/api/decisions/abc/resolve", { note: "ok", selectedOptionId: "approve", status: "approved" })
  )
  expect(response.status).toBe(200)
  expect(calls).toEqual([
    {
      arguments: { decisionId: "abc", resolution: { note: "ok", selectedOptionId: "approve", status: "approved" } },
      name: "evergreen.decision.resolve"
    }
  ])
  bridge.stop(true)
})

test("a refused tool call is a 409 with the bridge's reason; malformed input never reaches the bridge", async () => {
  const calls: unknown[] = []
  const bridge = fakeBridge(calls, true)
  const console = server(`http://127.0.0.1:${bridge.port}/mcp`)
  const refused = await console.respond(
    action("/api/decisions/abc/resolve", { selectedOptionId: "x", status: "approved" })
  )
  expect(refused.status).toBe(409)
  expect(((await refused.json()) as { error: { message: string } }).error.message).toContain("already resolved")
  expect((await console.respond(action("/api/decisions/abc/resolve", { status: "maybe" }))).status).toBe(400)
  expect(calls).toHaveLength(1)
  bridge.stop(true)
})

test("serves the page and the snapshot, and streams freshness as server-sent events", async () => {
  const console = server("http://127.0.0.1:1/mcp")
  const page = await console.respond(new Request("http://127.0.0.1:7460/", { headers: { host: "127.0.0.1:7460" } }))
  expect(await page.text()).toContain('<script type="module" src="/assets/app.js">')
  const snapshot = await console.respond(
    new Request("http://127.0.0.1:7460/api/snapshot", { headers: { host: "127.0.0.1:7460" } })
  )
  expect(((await snapshot.json()) as { readAt: string }).readAt).toBe("now")
  const controller = new AbortController()
  const stream = await console.respond(
    new Request("http://127.0.0.1:7460/api/events", { headers: { host: "127.0.0.1:7460" }, signal: controller.signal })
  )
  const reader = stream.body?.getReader()
  const first = new TextDecoder().decode((await reader?.read())?.value)
  expect(first).toBe('event: freshness\ndata: {"freshness":null}\n\n')
  controller.abort()
})

test("only tools Jarvis may propose can be invoked as console actions", async () => {
  const calls: unknown[] = []
  const bridge = fakeBridge(calls)
  const console = server(`http://127.0.0.1:${bridge.port}/mcp`)
  expect(
    (await console.respond(action("/api/actions", { arguments: { goalId: "g" }, tool: "evergreen.integration.run" })))
      .status
  ).toBe(200)
  for (const tool of ["evergreen.decision.resolve", "evergreen.handoff.execute", "evergreen.workspace.sync"]) {
    expect((await console.respond(action("/api/actions", { arguments: {}, tool }))).status).toBe(400)
  }
  expect((await console.respond(action("/api/jarvis", { goalId: null, question: "What is stuck?" }))).status).toBe(200)
  expect(calls).toEqual([
    { arguments: { goalId: "g" }, name: "evergreen.integration.run" },
    { arguments: { goalId: null, question: "What is stuck?" }, name: "evergreen.jarvis.ask" }
  ])
  bridge.stop(true)
})
