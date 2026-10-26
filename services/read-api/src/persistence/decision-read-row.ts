/** @module PostgreSQL read-decision row conversion. */

import { decisionOptionSchema, decisionResolutionSchema, decisionStatusSchema } from "@evergreen-terrace/contracts"
import type { ReadDecision } from "./decision-read-repository.types"

interface ReadDecisionRow {
  category: unknown
  context: unknown
  goal_id: unknown
  id: unknown
  options: unknown
  project_id: unknown
  recommended_option_id: unknown
  requested_at: unknown
  resolution: unknown
  resolved_at: unknown
  status: unknown
  title: unknown
  updated_at: unknown
}

const jsonValue = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value)

const nullableString = (value: unknown): string | null => (value === null ? null : String(value))

const nullableDate = (value: unknown): Date | null => (value === null ? null : new Date(String(value)))

export const readDecisionFromRow = (row: ReadDecisionRow): ReadDecision => ({
  category: String(row.category),
  context: String(row.context),
  goal_id: nullableString(row.goal_id),
  id: String(row.id),
  options: decisionOptionSchema.array().parse(jsonValue(row.options)),
  project_id: String(row.project_id),
  recommended_option_id: nullableString(row.recommended_option_id),
  requested_at: new Date(String(row.requested_at)),
  resolution: row.resolution === null ? null : decisionResolutionSchema.parse(jsonValue(row.resolution)),
  resolved_at: nullableDate(row.resolved_at),
  status: decisionStatusSchema.parse(row.status),
  title: String(row.title),
  updated_at: new Date(String(row.updated_at))
})
