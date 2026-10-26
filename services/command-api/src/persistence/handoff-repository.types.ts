/** @module GitHub handoff persistence contracts. */

import type { HandoffPlan, HandoffResult, HandoffStatus } from "@evergreen-terrace/contracts"

export interface HandoffRecord {
  body: string
  createdAt: Date
  decisionId: string
  detail: string
  goalId: string
  id: string
  idempotencyKey: string
  integrationId: string
  lastEventId: string
  plan: HandoffPlan
  projectId: string
  result: HandoffResult | null
  sequence: number
  status: HandoffStatus
  updatedAt: Date
}
