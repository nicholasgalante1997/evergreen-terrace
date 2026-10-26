/** @module Typed command-worker errors for HTTP mapping. */

export class WorkerNotFoundError extends Error {
  constructor(workerId: string) {
    super(`Worker not found: ${workerId}`)
    this.name = "WorkerNotFoundError"
  }
}

export class WorkerTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkerTransitionError"
  }
}

export class WorkerAssignmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkerAssignmentError"
  }
}

export class WorkerLeaseConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkerLeaseConflictError"
  }
}

export class WorkerBriefConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkerBriefConflictError"
  }
}

export class WorkerBriefNotFoundError extends Error {
  constructor(workerId: string) {
    super(`Worker brief not found: ${workerId}`)
    this.name = "WorkerBriefNotFoundError"
  }
}
