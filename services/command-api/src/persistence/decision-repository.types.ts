/** @module Command-decision persistence contracts. */

import type { DecisionRequest, DecisionResolution, DecisionStatus } from "@evergreen-terrace/contracts"

export interface DecisionRecord extends DecisionRequest {
  createdAt: Date
  id: string
  requestedEventId: string
  resolvedAt: Date | null
  resolvedEventId: string | null
  resolution: DecisionResolution | null
  status: DecisionStatus
}

export interface NewDecision {
  id: string
  requestedEventId: string
  request: DecisionRequest
}

export interface CommandDecisionSummary {
  category: string
  created_at: Date
  goal_id: string | null
  id: string
  project_id: string
  status: DecisionStatus
  title: string
  updated_at: Date
}
