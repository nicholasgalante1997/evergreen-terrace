/** @module Typed command-decision errors for HTTP mapping. */

export class DecisionNotFoundError extends Error {
  constructor(decisionId: string) {
    super(`Decision not found: ${decisionId}`)
    this.name = "DecisionNotFoundError"
  }
}

export class DecisionConflictError extends Error {
  constructor(decisionId: string, status: string) {
    super(`Decision ${decisionId} is already ${status}`)
    this.name = "DecisionConflictError"
  }
}

export class DecisionResolutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DecisionResolutionError"
  }
}
