/** @module Durable ACP worker-execution contracts. */

import type { AcpAdapter, AcpWorkerResult } from "./acp-runner.types"

export interface WorkerExecutionInput {
  adapter: AcpAdapter
  artifactDirectory: string
  goalId: string
  projectId: string
  prompt: string
  role: string
  schedulerId: string
  signal?: AbortSignal
  workerId: string
  worktreePath: string
}

export interface WorkerExecutionResult {
  result: AcpWorkerResult
  workerId: string
}
