/** @module Loopback stateful JSON-response MCP HTTP transport. */

import { HttpRouteRegistry, HttpServer, jsonError } from "@evergreen-terrace/service-runtime"
import type { McpHttpServerOptions } from "./http-server.types"
import { McpHttpRequestHandler } from "./mcp-http-request-handler"
import { McpHttpSessionStore } from "./mcp-http-session-store"

export class McpHttpServer extends HttpServer {
  readonly #routes: HttpRouteRegistry

  constructor(options: McpHttpServerOptions) {
    super({ service: "host-bridge", hostname: "127.0.0.1", port: options.port })
    const handler = new McpHttpRequestHandler(
      options.mcp,
      new McpHttpSessionStore({ capacity: 32, idleMs: 15 * 60 * 1000 })
    )
    this.#routes = new HttpRouteRegistry().register(
      { handle: ({ request }) => handler.handlePost(request), method: "POST", name: "mcp.dispatch", path: "/mcp" },
      { handle: ({ request }) => handler.endSession(request), method: "DELETE", name: "mcp.end_session", path: "/mcp" }
    )
  }

  protected async handleRequest(request: Request): Promise<Response> {
    const response = await this.#routes.dispatch(request)
    if (response !== undefined) {
      return response
    }
    if (new URL(request.url).pathname === "/mcp") {
      return jsonError(405, "method_not_allowed", "Use POST for MCP requests or DELETE to end a session")
    }
    return jsonError(404, "not_found", "Route not found")
  }
}
