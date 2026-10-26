/** @module Safe host-process execution result contracts. */

export interface ProcessResult {
  stderr: string
  stdout: string
}

export interface ProcessOutcome extends ProcessResult {
  exitCode: number
}
