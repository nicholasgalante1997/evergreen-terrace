/** @module Read-only agent-session contracts for the mayor and discovery agents. */

import type { WorkerAdapter } from "@evergreen-terrace/contracts"

export interface ReadOnlyAgentRun {
  adapter: WorkerAdapter
  artifactDirectory: string
  checkoutPath: string
  /** Names the session in its event log, e.g. `mayor:<planId>`. */
  label: string
  prompt: string
  continueWith?: (turnText: string) => Promise<string | null>
}

export interface ReadOnlyAgentPort {
  run(input: ReadOnlyAgentRun): Promise<{ stopReason: string; turns: number }>
}

export type StructuredOutcome<T> = { ok: true; turns: number; value: T } | { detail: string; ok: false }

export interface ReadOnlyCheckout {
  artifactDirectory: string
  checkoutPath: string
}
