/** @module Typed validation and integration evidence errors for HTTP mapping. */

export class EvidenceNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EvidenceNotFoundError"
  }
}

export class EvidenceConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EvidenceConflictError"
  }
}
