/** @module Learned-preference aggregate repository. */

import { preferenceCategorySchema, preferenceStatusSchema } from "@evergreen-terrace/contracts"
import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { SQL } from "bun"
import { z } from "zod"
import type { PreferenceChange, PreferenceRecord } from "./preference-repository.types"

const jsonValue = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value)

const preferenceFromRow = (row: Record<string, unknown>): PreferenceRecord => ({
  category: preferenceCategorySchema.parse(row.category),
  createdAt: new Date(String(row.created_at)),
  decisionId: row.decision_id === null ? null : String(row.decision_id),
  detail: String(row.detail),
  evidence: z.array(z.string()).parse(jsonValue(row.evidence)),
  id: String(row.id),
  idempotencyKey: String(row.idempotency_key),
  key: String(row.key),
  lastEventId: String(row.last_event_id),
  projectId: row.project_id === null ? null : String(row.project_id),
  rationale: String(row.rationale),
  scope: row.scope === "project" ? "project" : "global",
  sequence: Number(row.aggregate_sequence),
  status: preferenceStatusSchema.parse(row.status),
  supersededBy: row.superseded_by === null ? null : String(row.superseded_by),
  updatedAt: new Date(String(row.updated_at)),
  value: String(row.value)
})

export class PreferenceRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  async create(record: Omit<PreferenceRecord, "createdAt" | "supersededBy" | "updatedAt">): Promise<void> {
    await this.sql`
      INSERT INTO evergreen.preferences (
        id, scope, project_id, key, category, value, evidence, rationale, status, decision_id, detail,
        idempotency_key, aggregate_sequence, last_event_id
      )
      VALUES (
        ${record.id}, ${record.scope}, ${record.projectId}, ${record.key}, ${record.category}, ${record.value},
        ${JSON.stringify(record.evidence)}::text::jsonb, ${record.rationale}, ${record.status}, ${record.decisionId},
        ${record.detail}, ${record.idempotencyKey}, ${record.sequence}, ${record.lastEventId}
      )
    `
  }

  async update(id: string, change: PreferenceChange): Promise<void> {
    const updated = await this.sql`
      UPDATE evergreen.preferences
      SET status = ${change.status}, detail = ${change.detail}, superseded_by = ${change.supersededBy},
          last_event_id = ${change.eventId}, aggregate_sequence = ${change.sequence}, updated_at = now()
      WHERE id = ${id} AND aggregate_sequence = ${change.sequence - 1}
      RETURNING id
    `
    if (updated[0] === undefined) {
      throw new Error(`Preference ${id} changed concurrently`)
    }
  }

  async findByIdempotency(projectId: string | null, idempotencyKey: string): Promise<PreferenceRecord | undefined> {
    const rows = await this.sql`
      SELECT * FROM evergreen.preferences
      WHERE project_id IS NOT DISTINCT FROM ${projectId} AND idempotency_key = ${idempotencyKey}
    `
    return rows[0] === undefined ? undefined : preferenceFromRow(rows[0])
  }

  async findByDecisionForUpdate(decisionId: string): Promise<PreferenceRecord | undefined> {
    const rows = await this.sql`SELECT * FROM evergreen.preferences WHERE decision_id = ${decisionId} FOR UPDATE`
    return rows[0] === undefined ? undefined : preferenceFromRow(rows[0])
  }

  /** Serializes changes to one profile key, including its first promotion. */
  async lockKey(scope: string, projectId: string | null, key: string): Promise<void> {
    await this.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`preference:${scope}:${projectId ?? ""}:${key}`}, 0))`
  }

  async findPromoted(scope: string, projectId: string | null, key: string): Promise<PreferenceRecord | undefined> {
    const rows = await this.sql`
      SELECT * FROM evergreen.preferences
      WHERE scope = ${scope} AND project_id IS NOT DISTINCT FROM ${projectId} AND key = ${key} AND status = 'promoted'
    `
    return rows[0] === undefined ? undefined : preferenceFromRow(rows[0])
  }

  /** The active profile for a project: global preferences plus that project's own. */
  async listPromoted(projectId: string | null): Promise<PreferenceRecord[]> {
    const rows = await this.sql`
      SELECT * FROM evergreen.preferences
      WHERE status = 'promoted' AND (scope = 'global' OR project_id = ${projectId})
      ORDER BY scope ASC, key ASC
    `
    return rows.map(preferenceFromRow)
  }

  async listAll(projectId: string | null): Promise<PreferenceRecord[]> {
    const rows = await this.sql`
      SELECT * FROM evergreen.preferences
      WHERE scope = 'global' OR project_id = ${projectId}
      ORDER BY created_at DESC
      LIMIT 200
    `
    return rows.map(preferenceFromRow)
  }
}
