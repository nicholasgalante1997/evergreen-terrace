/** @module Command-route persistence-error translation. */

import { jsonError } from "@evergreen-terrace/service-runtime"
import { DecisionConflictError, DecisionNotFoundError, DecisionResolutionError } from "../persistence/decision-error"
import { EvidenceConflictError, EvidenceNotFoundError } from "../persistence/evidence-error"
import {
  WorkerAssignmentError,
  WorkerBriefConflictError,
  WorkerBriefNotFoundError,
  WorkerLeaseConflictError,
  WorkerNotFoundError,
  WorkerTransitionError
} from "../persistence/worker-error"

const details = (error: unknown) => ({ message: error instanceof Error ? error.message : "unknown error" })

export const decisionErrorResponse = (error: unknown, fallbackCode: string): Response => {
  if (error instanceof DecisionNotFoundError) {
    return jsonError(404, "decision_not_found", error.message)
  }
  if (error instanceof DecisionConflictError) {
    return jsonError(409, "decision_conflict", error.message)
  }
  if (error instanceof DecisionResolutionError) {
    return jsonError(400, "invalid_decision_resolution", error.message)
  }
  return jsonError(500, fallbackCode, "Unable to persist the decision command", details(error))
}

export const evidenceErrorResponse = (error: unknown, fallbackCode: string): Response => {
  if (error instanceof EvidenceNotFoundError) {
    return jsonError(404, "evidence_not_found", error.message)
  }
  if (error instanceof EvidenceConflictError) {
    return jsonError(409, "evidence_conflict", error.message)
  }
  return jsonError(500, fallbackCode, "Unable to persist the evidence command", details(error))
}

export const workerErrorResponse =(error: unknown, fallbackCode: string): Response => {
  if (error instanceof WorkerNotFoundError) {
    return jsonError(404, "worker_not_found", error.message)
  }
  if (error instanceof WorkerBriefNotFoundError) {
    return jsonError(404, "worker_brief_not_found", error.message)
  }
  if (error instanceof WorkerAssignmentError || error instanceof WorkerTransitionError) {
    return jsonError(409, "worker_state_conflict", error.message)
  }
  if (error instanceof WorkerLeaseConflictError) {
    return jsonError(409, "worker_lease_conflict", error.message)
  }
  if (error instanceof WorkerBriefConflictError) {
    return jsonError(409, "worker_brief_conflict", error.message)
  }
  return jsonError(500, fallbackCode, "Unable to persist the worker command", details(error))
}
