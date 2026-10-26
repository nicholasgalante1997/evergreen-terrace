/** @module Same-origin console API: read-model snapshots, a freshness stream, and governed actions. */

import { jsonError, requiredRouteParam } from "@evergreen-terrace/service-runtime"
import type { HttpRoute } from "@evergreen-terrace/service-runtime"
import { z } from "zod"
import { BridgeToolError } from "../bridge/bridge-client"
import { freshnessStream } from "./freshness-stream"
import type { ConsoleRoutePorts } from "./console-server.types"

const resolutionSchema = z
  .object({
    note: z.string().max(8_000).default(""),
    selectedOptionId: z
      .string()
      .regex(/^[a-z][a-z0-9_-]{0,63}$/)
      .nullable(),
    status: z.enum(["approved", "rejected"])
  })
  .strict()

const askSchema = z
  .object({ goalId: z.string().uuid().nullable().default(null), question: z.string().min(1).max(4_000) })
  .strict()

/**
 * Tools a Jarvis proposal may name, mirroring the bridge's own list. The console
 * runs one only on an explicit click, and the tool still applies its own policy.
 */
export const invocableTools = new Set([
  "evergreen.plan.draft",
  "evergreen.plan.launch",
  "evergreen.schedule.resume",
  "evergreen.validation.run",
  "evergreen.integration.run",
  "evergreen.integration.resolve",
  "evergreen.handoff.request"
])

const actionSchema = z.object({ arguments: z.record(z.string(), z.unknown()), tool: z.string() }).strict()

const bridgeFailure = (error: unknown): Response =>
  error instanceof BridgeToolError
    ? jsonError(409, "action_refused", error.message)
    : jsonError(502, "bridge_unavailable", error instanceof Error ? error.message : String(error))

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Evergreen Console</title>
    <link rel="stylesheet" href="/assets/app.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/app.js"></script>
  </body>
</html>
`

const assetTypes: Record<string, string> = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  map: "application/json"
}

export const consoleRoutes = (ports: ConsoleRoutePorts): HttpRoute[] => [
  {
    handle: () =>
      new Response(page, {
        headers: { "content-security-policy": "default-src 'self'", "content-type": "text/html; charset=utf-8" }
      }),
    method: "GET",
    name: "console.page",
    path: "/"
  },
  {
    handle: async ({ params }) => {
      const name = requiredRouteParam(params, "asset")
      const extension = name.split(".").at(-1) ?? ""
      const file = Bun.file(`${ports.assetsDirectory}/${name}`)
      if (!/^app\.(js|css)(\.map)?$/.test(name) || !(await file.exists())) {
        return jsonError(404, "not_found", "Asset not found")
      }
      return new Response(file, {
        headers: { "cache-control": "no-cache", "content-type": assetTypes[extension] ?? "application/octet-stream" }
      })
    },
    method: "GET",
    name: "console.asset",
    path: "/assets/:asset"
  },
  {
    handle: async () => {
      try {
        return Response.json(await ports.readApi.snapshot(), { headers: { "cache-control": "no-store" } })
      } catch (error) {
        return jsonError(502, "read_api_unavailable", error instanceof Error ? error.message : String(error))
      }
    },
    method: "GET",
    name: "console.snapshot",
    path: "/api/snapshot"
  },
  {
    handle: ({ request }) =>
      freshnessStream({
        heartbeatMs: 15_000,
        intervalMs: ports.pollIntervalMs,
        read: () => ports.readApi.freshness(),
        signal: request.signal
      }),
    method: "GET",
    name: "console.events",
    path: "/api/events"
  },
  {
    handle: async ({ params, request }) => {
      const parsed = resolutionSchema.safeParse(await request.json().catch(() => null))
      if (!parsed.success) {
        return jsonError(
          400,
          "invalid_resolution",
          "A resolution needs status, selectedOptionId, and an optional note",
          parsed.error.issues
        )
      }
      try {
        const result = await ports.bridge.callTool("evergreen.decision.resolve", {
          decisionId: requiredRouteParam(params, "decisionId"),
          resolution: parsed.data
        })
        return Response.json({ result })
      } catch (error) {
        return bridgeFailure(error)
      }
    },
    method: "POST",
    name: "console.decision.resolve",
    path: "/api/decisions/:decisionId/resolve"
  },
  {
    handle: async ({ request }) => {
      const parsed = askSchema.safeParse(await request.json().catch(() => null))
      if (!parsed.success) {
        return jsonError(400, "invalid_question", "A question needs text and an optional goalId", parsed.error.issues)
      }
      try {
        return Response.json({ result: await ports.bridge.callTool("evergreen.jarvis.ask", parsed.data) })
      } catch (error) {
        return bridgeFailure(error)
      }
    },
    method: "POST",
    name: "console.jarvis.ask",
    path: "/api/jarvis"
  },
  {
    handle: async ({ request }) => {
      const parsed = actionSchema.safeParse(await request.json().catch(() => null))
      if (!parsed.success || !invocableTools.has(parsed.data.tool)) {
        return jsonError(
          400,
          "action_not_invocable",
          "Only governed tools Jarvis may propose can be invoked from the console"
        )
      }
      try {
        return Response.json({ result: await ports.bridge.callTool(parsed.data.tool, parsed.data.arguments) })
      } catch (error) {
        return bridgeFailure(error)
      }
    },
    method: "POST",
    name: "console.action",
    path: "/api/actions"
  }
]
