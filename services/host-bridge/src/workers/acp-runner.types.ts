/** @module ACP worker-runner contracts. */

export type AcpAdapter = "claude" | "codex"

export interface AcpWorkerRun {
  adapter: AcpAdapter
  artifactDirectory: string
  prompt: string
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
  workerId: string
}

/** The ACP response plus how it was decided; `rule` and `decisionId` are the audit trail. */
export type AcpPermissionResolution =
  | { granted: true; response: unknown; rule: string; via: "automatic" }
  | { decisionId: string; granted: boolean; response: unknown; via: "decision" }

export interface AcpPermissionResolver {
  resolve(params: unknown): Promise<AcpPermissionResolution>
}
