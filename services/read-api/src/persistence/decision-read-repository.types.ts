/** @module Read-model decision persistence contracts. */

import type { DecisionOption, DecisionResolution, DecisionStatus } from "@evergreen-terrace/contracts"

export interface ReadDecision {
  category: string
  context: string
  goal_id: string | null
  id: string
  options: DecisionOption[]
  project_id: string
  recommended_option_id: string | null
  requested_at: Date
  resolution: DecisionResolution | null
  resolved_at: Date | null
  status: DecisionStatus
  title: string
  updated_at: Date
}
