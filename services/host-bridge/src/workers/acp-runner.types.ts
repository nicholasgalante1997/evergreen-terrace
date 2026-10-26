/** @module ACP worker-runner contracts. */

export type AcpAdapter = "claude" | "codex"

export interface AcpWorkerRun {
  adapter: AcpAdapter
  artifactDirectory: string
  prompt: string
  /**
   * Called after each turn with the agent's text from that turn. Returning a
   * prompt sends it as the next turn in the same session; null ends the session.
   */
  continueWith?: (turnText: string) => Promise<string | null>
  /** Mounts the worktree read-only: for mayor and discovery sessions, which must never write. */
  readOnly?: boolean
  /** Aborting terminates the sandboxed adapter, e.g. when the scheduler loses its lease. */
  signal?: AbortSignal
  worktreePath: string
  workerId: string
}

export interface AcpWorkerResult {
  adapter: AcpAdapter
  completedAt: string
  eventLogPath: string
  resultPath: string
  sessionId: string
  startedAt: string
  stopReason: string
  turns: number
  workerId: string
}

/** The ACP response plus how it was decided; `rule` and `decisionId` are the audit trail. */
export type AcpPermissionResolution =
  | { granted: true; response: unknown; rule: string; via: "automatic" }
  | { decisionId: string; granted: boolean; response: unknown; via: "decision" }
  | { granted: false; response: unknown; rule: string; via: "policy" }

export interface AcpPermissionResolver {
  resolve(params: unknown): Promise<AcpPermissionResolution>
}
