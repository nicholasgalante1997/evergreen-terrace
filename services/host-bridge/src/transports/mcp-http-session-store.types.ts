/** @module MCP HTTP session-store contracts. */

import type { McpSession } from "@evergreen-terrace/mcp-core"

export interface McpHttpSessionStoreOptions {
  capacity: number
  idleMs: number
}

export interface McpHttpSessionAcquireInput {
  createSession(): McpSession
  initialize: boolean
  now: number
  requestedSessionId: string | null
}

export type McpHttpSessionAcquireResult =
  | { kind: "ready"; session: McpSession; sessionId: string }
  | { kind: "session_required" }
  | { kind: "unknown_session" }
  | { kind: "capacity_reached" }
