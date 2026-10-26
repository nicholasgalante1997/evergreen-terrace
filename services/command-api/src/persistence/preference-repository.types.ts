/** @module Learned-preference persistence contracts. */

import type { PreferenceCategory, PreferenceStatus } from "@evergreen-terrace/contracts"

export interface PreferenceRecord {
  category: PreferenceCategory
  createdAt: Date
  decisionId: string | null
  detail: string
  evidence: string[]
  id: string
  idempotencyKey: string
  key: string
  lastEventId: string
  projectId: string | null
  rationale: string
  scope: "global" | "project"
  sequence: number
  status: PreferenceStatus
  supersededBy: string | null
  updatedAt: Date
  value: string
}

export interface PreferenceChange {
  detail: string
  eventId: string
  sequence: number
  status: PreferenceStatus
  supersededBy: string | null
}
