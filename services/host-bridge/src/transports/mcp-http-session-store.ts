/** @module Bounded, idle-pruned MCP HTTP session store. */

import type { McpSession } from "@evergreen-terrace/mcp-core"
import type {
  McpHttpSessionAcquireInput,
  McpHttpSessionAcquireResult,
  McpHttpSessionStoreOptions
} from "./mcp-http-session-store.types"

interface StoredSession {
  lastActivityAt: number
  session: McpSession
}

export class McpHttpSessionStore {
  readonly #sessions = new Map<string, StoredSession>()

  constructor(private readonly options: McpHttpSessionStoreOptions) {}

  acquire(input: McpHttpSessionAcquireInput): McpHttpSessionAcquireResult {
    this.prune(input.now)
    const sessionId = input.requestedSessionId ?? (input.initialize ? crypto.randomUUID() : undefined)
    if (sessionId === undefined) {
      return { kind: "session_required" }
    }
    const existing = this.#sessions.get(sessionId)
    if (existing === undefined && !input.initialize) {
      return { kind: "unknown_session" }
    }
    if (existing === undefined && this.#sessions.size >= this.options.capacity) {
      return { kind: "capacity_reached" }
    }
    const session = existing?.session ?? input.createSession()
    if (input.initialize) {
      this.#sessions.set(sessionId, { lastActivityAt: input.now, session })
    } else if (existing !== undefined) {
      existing.lastActivityAt = input.now
    }
    return { kind: "ready", session, sessionId }
  }

  delete(sessionId: string): boolean {
    return this.#sessions.delete(sessionId)
  }

  private prune(now: number): void {
    for (const [sessionId, session] of this.#sessions) {
      if (now - session.lastActivityAt > this.options.idleMs) {
        this.#sessions.delete(sessionId)
      }
    }
  }
}
