/** @module Governed validation contracts. */

import type { ValidationCommandResult, ValidationSubject } from "@evergreen-terrace/contracts"

export type ValidationPhase = "setup" | "check"

export interface ValidationSandboxInput {
  cacheDirectory: string
  command: string
  phase: ValidationPhase
  temporaryDirectory: string
  worktreePath: string
}

export interface ValidationPlan {
  checks: readonly string[]
  setup: readonly string[]
  timeoutSeconds: number
}

export interface ValidationRun {
  artifactDirectory: string
  plan: ValidationPlan
  worktreePath: string
}

export interface ValidationRunResult {
  completedAt: string
  results: ValidationCommandResult[]
  startedAt: string
  status: "passed" | "failed"
}

export interface ValidationCommandRunner {
  run(input: ValidationRun): Promise<ValidationRunResult>
}

export interface ValidationRequest {
  artifactDirectory: string
  goalId: string
  idempotencyKey: string
  projectId: string
  subject: ValidationSubject
  worktreePath: string
}

export interface ValidationOutcome {
  commitSha: string
  status: "passed" | "failed"
  validationId: string
}
