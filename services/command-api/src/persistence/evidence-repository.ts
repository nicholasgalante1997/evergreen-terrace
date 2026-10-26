/** @module Validation and integration evidence repositories. */

import { integrationCompletionSchema, validationRecordSchema } from "@evergreen-terrace/contracts"
import type { IntegrationCompletion, ValidationRecord } from "@evergreen-terrace/contracts"
import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { SQL } from "bun"
import type { GoalBase, IntegrationRecord, IntegrationStatus, ValidationEvidence } from "./evidence-repository.types"

const jsonValue = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value)

const validationFromRow = (row: Record<string, unknown>): ValidationEvidence => ({
  ...validationRecordSchema.parse(jsonValue(row.record)),
  completedEventId: String(row.completed_event_id),
  createdAt: new Date(String(row.created_at)),
  id: String(row.id)
})

const integrationFromRow = (row: Record<string, unknown>): IntegrationRecord => ({
  attempt: Number(row.attempt),
  baseRef: String(row.base_ref),
  baseSha: String(row.base_sha),
  completion: row.completion === null ? null : integrationCompletionSchema.parse(jsonValue(row.completion)),
  createdAt: new Date(String(row.created_at)),
  goalId: String(row.goal_id),
  id: String(row.id),
  idempotencyKey: String(row.idempotency_key),
  lastEventId: String(row.last_event_id),
  projectId: String(row.project_id),
  resolvesIntegrationId: row.resolves_integration_id === null || row.resolves_integration_id === undefined ? null : String(row.resolves_integration_id),
  sequence: Number(row.aggregate_sequence),
  status: String(row.status) as IntegrationStatus,
  updatedAt: new Date(String(row.updated_at))
})

export class ValidationRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  async create(id: string, validation: ValidationRecord, completedEventId: string): Promise<boolean> {
    const inserted = await this.sql`
      INSERT INTO evergreen.validations (
        id, project_id, goal_id, subject_type, subject_id, commit_sha, status, record, idempotency_key, completed_event_id
      )
      VALUES (
        ${id}, ${validation.projectId}, ${validation.goalId}, ${validation.subject.type}, ${validation.subject.id},
        ${validation.commitSha}, ${validation.status}, ${JSON.stringify(validation)}::text::jsonb, ${validation.idempotencyKey},
        ${completedEventId}
      )
      ON CONFLICT (project_id, idempotency_key) DO NOTHING
      RETURNING id
    `
    return inserted[0] !== undefined
  }

  async findById(id: string): Promise<ValidationEvidence | undefined> {
    const rows = await this.sql`SELECT * FROM evergreen.validations WHERE id = ${id}`
    return rows[0] === undefined ? undefined : validationFromRow(rows[0])
  }

  async findByIdempotency(projectId: string, idempotencyKey: string): Promise<ValidationEvidence | undefined> {
    const rows = await this.sql`
      SELECT * FROM evergreen.validations WHERE project_id = ${projectId} AND idempotency_key = ${idempotencyKey}
    `
    return rows[0] === undefined ? undefined : validationFromRow(rows[0])
  }

  async listByGoal(goalId: string): Promise<ValidationEvidence[]> {
    const rows = await this.sql`SELECT * FROM evergreen.validations WHERE goal_id = ${goalId} ORDER BY created_at ASC`
    return rows.map(validationFromRow)
  }
}

export class IntegrationRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  /** Locks the goal row so attempt allocation is serialized per goal. */
  async lockGoal(goalId: string): Promise<GoalBase | undefined> {
    const rows = await this.sql`SELECT project_id, base_ref, base_sha FROM evergreen.goals WHERE id = ${goalId} FOR UPDATE`
    const row = rows[0]
    return row === undefined
      ? undefined
      : { baseRef: String(row.base_ref), baseSha: String(row.base_sha), projectId: String(row.project_id) }
  }

  async nextAttempt(goalId: string): Promise<number> {
    const rows = await this.sql`SELECT COALESCE(MAX(attempt), 0) + 1 AS attempt FROM evergreen.integrations WHERE goal_id = ${goalId}`
    return Number(rows[0]?.attempt ?? 1)
  }

  async create(record: Omit<IntegrationRecord, "completion" | "createdAt" | "status" | "updatedAt">): Promise<void> {
    await this.sql`
      INSERT INTO evergreen.integrations (
        id, project_id, goal_id, attempt, base_ref, base_sha, status, idempotency_key, aggregate_sequence, last_event_id,
        resolves_integration_id
      )
      VALUES (
        ${record.id}, ${record.projectId}, ${record.goalId}, ${record.attempt}, ${record.baseRef}, ${record.baseSha},
        ${"started"}, ${record.idempotencyKey}, ${record.sequence}, ${record.lastEventId}, ${record.resolvesIntegrationId}
      )
    `
  }

  async complete(id: string, completion: IntegrationCompletion, eventId: string, sequence: number): Promise<void> {
    const updated = await this.sql`
      UPDATE evergreen.integrations
      SET status = ${completion.status}, completion = ${JSON.stringify(completion)}::text::jsonb, last_event_id = ${eventId},
          aggregate_sequence = ${sequence}, updated_at = now()
      WHERE id = ${id} AND aggregate_sequence = ${sequence - 1}
      RETURNING id
    `
    if (updated[0] === undefined) {
      throw new Error(`Integration ${id} changed concurrently while completing`)
    }
  }

  async findById(id: string): Promise<IntegrationRecord | undefined> {
    const rows = await this.sql`SELECT * FROM evergreen.integrations WHERE id = ${id}`
    return rows[0] === undefined ? undefined : integrationFromRow(rows[0])
  }

  async findByIdForUpdate(id: string): Promise<IntegrationRecord | undefined> {
    const rows = await this.sql`SELECT * FROM evergreen.integrations WHERE id = ${id} FOR UPDATE`
    return rows[0] === undefined ? undefined : integrationFromRow(rows[0])
  }

  async findByIdempotency(projectId: string, idempotencyKey: string): Promise<IntegrationRecord | undefined> {
    const rows = await this.sql`
      SELECT * FROM evergreen.integrations WHERE project_id = ${projectId} AND idempotency_key = ${idempotencyKey}
    `
    return rows[0] === undefined ? undefined : integrationFromRow(rows[0])
  }

  async listByGoal(goalId: string): Promise<IntegrationRecord[]> {
    const rows = await this.sql`SELECT * FROM evergreen.integrations WHERE goal_id = ${goalId} ORDER BY attempt ASC`
    return rows.map(integrationFromRow)
  }
}
