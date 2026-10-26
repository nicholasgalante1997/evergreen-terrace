/** @module Stateful MCP-over-HTTP request handling. */

import { jsonError } from "@evergreen-terrace/service-runtime"
import type { McpServer } from "@evergreen-terrace/mcp-core"
import { isMcpInitialize, mcpSessionHeader, parseMcpHttpPayload } from "./mcp-http-payload"
import { mcpHttpError } from "./mcp-http-response"
import { McpHttpSessionStore } from "./mcp-http-session-store"

export class McpHttpRequestHandler {
  constructor(
    private readonly mcp: McpServer,
    private readonly sessions: McpHttpSessionStore
  ) {}

  endSession(request: Request): Response {
    const sessionId = request.headers.get(mcpSessionHeader)
    if (sessionId === null || !this.sessions.delete(sessionId)) {
      return jsonError(404, "unknown_session", "MCP session was not found")
    }
    return new Response(null, { status: 204 })
  }

  async handlePost(request: Request): Promise<Response> {
    const payload = await parseMcpHttpPayload(request)
    if (payload instanceof Response) {
      return payload
    }
    const initialize = isMcpInitialize(payload)
    const resolution = this.sessions.acquire({
      createSession: () => this.mcp.createSession(),
      initialize,
      now: Date.now(),
      requestedSessionId: request.headers.get(mcpSessionHeader)
    })
    if (resolution.kind === "session_required") {
      return mcpHttpError(400, -32001, "Mcp-Session-Id is required after initialize")
    }
    if (resolution.kind === "unknown_session") {
      return mcpHttpError(404, -32001, "Unknown MCP session")
    }
    if (resolution.kind === "capacity_reached") {
      return mcpHttpError(429, -32003, "MCP session capacity reached")
    }
    const response = await this.mcp.dispatch(payload, resolution.session)
    if (response === undefined) {
      return new Response(null, { status: 202 })
    }
    return Response.json(response, { headers: initialize ? { [mcpSessionHeader]: resolution.sessionId } : undefined })
  }
}
