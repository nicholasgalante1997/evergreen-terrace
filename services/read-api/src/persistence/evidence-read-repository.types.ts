/** @module Read-model validation and integration evidence contracts. */

import type { HandoffPlan, HandoffResult, IntegrationCompletion, ValidationRecord } from "@evergreen-terrace/contracts"

export interface ReadHandoff {
  decision_id: string
  detail: string
  goal_id: string
  id: string
  integration_id: string
  plan: HandoffPlan
  project_id: string
  requested_at: Date
  result: HandoffResult | null
  status: string
  updated_at: Date
}

export interface ReadValidation extends ValidationRecord {
  id: string
}

export interface ReadIntegration {
  attempt: number
  base_ref: string
  base_sha: string
  completion: IntegrationCompletion | null
  goal_id: string
  id: string
  project_id: string
  resolves_integration_id: string | null
  started_at: Date
  status: string
  updated_at: Date
}
