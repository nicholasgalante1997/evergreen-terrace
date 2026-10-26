/** @module PostgreSQL decision-row conversion. */

import { decisionRequestSchema, decisionResolutionSchema, decisionStatusSchema } from "@evergreen-terrace/contracts"
import type { DecisionRecord } from "./decision-repository.types"

interface DecisionRow {
  category: unknown
  context: unknown
  created_at: unknown
  goal_id: unknown
  id: unknown
  idempotency_key: unknown
  options: unknown
  project_id: unknown
  recommended_option_id: unknown
  requested_event_id: unknown
  resolved_at: unknown
  resolved_event_id: unknown
  resolution: unknown
  status: unknown
  title: unknown
}

const jsonValue = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value)

const nullableString = (value: unknown): string | null => (value === null ? null : String(value))

const nullableDate = (value: unknown): Date | null => (value === null ? null : new Date(String(value)))

export const decisionRecordFromRow = (row: DecisionRow): DecisionRecord => {
  const request = decisionRequestSchema.parse({
    category: row.category,
    context: row.context,
    goalId: row.goal_id,
    idempotencyKey: row.idempotency_key,
    options: jsonValue(row.options),
    projectId: row.project_id,
    recommendedOptionId: row.recommended_option_id,
    title: row.title
  })
  return {
    ...request,
    createdAt: new Date(String(row.created_at)),
    id: String(row.id),
    requestedEventId: String(row.requested_event_id),
    resolvedAt: nullableDate(row.resolved_at),
    resolvedEventId: nullableString(row.resolved_event_id),
    resolution: row.resolution === null ? null : decisionResolutionSchema.parse(jsonValue(row.resolution)),
    status: decisionStatusSchema.parse(row.status)
  }
}
