/** @module Validation and integration evidence persistence contracts. */

import type { IntegrationCompletion, ValidationRecord } from "@evergreen-terrace/contracts"

export interface ValidationEvidence extends ValidationRecord {
  completedEventId: string
  createdAt: Date
  id: string
}

export type IntegrationStatus = "started" | IntegrationCompletion["status"]

export interface IntegrationRecord {
  attempt: number
  baseRef: string
  baseSha: string
  completion: IntegrationCompletion | null
  createdAt: Date
  goalId: string
  id: string
  idempotencyKey: string
  lastEventId: string
  projectId: string
  resolvesIntegrationId: string | null
  sequence: number
  status: IntegrationStatus
  updatedAt: Date
}

export interface GoalBase {
  baseRef: string
  baseSha: string
  projectId: string
}
