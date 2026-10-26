/** @module GitHub handoff aggregate repository. */

import { handoffPlanSchema, handoffResultSchema, handoffStatusSchema } from "@evergreen-terrace/contracts"
import type { HandoffResult, HandoffStatus } from "@evergreen-terrace/contracts"
import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { SQL } from "bun"
import type { HandoffRecord } from "./handoff-repository.types"

const jsonValue = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value)

const handoffFromRow = (row: Record<string, unknown>): HandoffRecord => ({
  body: String(row.body),
  createdAt: new Date(String(row.created_at)),
  decisionId: String(row.decision_id),
  detail: String(row.detail),
  goalId: String(row.goal_id),
  id: String(row.id),
  idempotencyKey: String(row.idempotency_key),
  integrationId: String(row.integration_id),
  lastEventId: String(row.last_event_id),
  plan: handoffPlanSchema.parse(jsonValue(row.plan)),
  projectId: String(row.project_id),
  result: row.result === null ? null : handoffResultSchema.parse(jsonValue(row.result)),
  sequence: Number(row.aggregate_sequence),
  status: handoffStatusSchema.parse(row.status),
  updatedAt: new Date(String(row.updated_at))
})

export class HandoffRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  async create(record: Omit<HandoffRecord, "createdAt" | "detail" | "result" | "status" | "updatedAt">): Promise<void> {
    await this.sql`
      INSERT INTO evergreen.handoffs (
        id, project_id, goal_id, integration_id, decision_id, plan, body, status, detail, idempotency_key,
        aggregate_sequence, last_event_id
      )
      VALUES (
        ${record.id}, ${record.projectId}, ${record.goalId}, ${record.integrationId}, ${record.decisionId},
        ${JSON.stringify(record.plan)}::text::jsonb, ${record.body}, ${"requested"}, ${""}, ${record.idempotencyKey},
        ${record.sequence}, ${record.lastEventId}
      )
    `
  }

  async update(
    id: string,
    change: { detail: string; eventId: string; result: HandoffResult | null; sequence: number; status: HandoffStatus }
  ): Promise<void> {
    const updated = await this.sql`
      UPDATE evergreen.handoffs
      SET status = ${change.status}, detail = ${change.detail},
          result = ${change.result === null ? null : JSON.stringify(change.result)}::text::jsonb,
          last_event_id = ${change.eventId}, aggregate_sequence = ${change.sequence}, updated_at = now()
      WHERE id = ${id} AND aggregate_sequence = ${change.sequence - 1}
      RETURNING id
    `
    if (updated[0] === undefined) {
      throw new Error(`Handoff ${id} changed concurrently`)
    }
  }

  async findById(id: string): Promise<HandoffRecord | undefined> {
    const rows = await this.sql`SELECT * FROM evergreen.handoffs WHERE id = ${id}`
    return rows[0] === undefined ? undefined : handoffFromRow(rows[0])
  }

  async findByIdForUpdate(id: string): Promise<HandoffRecord | undefined> {
    const rows = await this.sql`SELECT * FROM evergreen.handoffs WHERE id = ${id} FOR UPDATE`
    return rows[0] === undefined ? undefined : handoffFromRow(rows[0])
  }

  async findByIdempotency(projectId: string, idempotencyKey: string): Promise<HandoffRecord | undefined> {
    const rows = await this.sql`
      SELECT * FROM evergreen.handoffs WHERE project_id = ${projectId} AND idempotency_key = ${idempotencyKey}
    `
    return rows[0] === undefined ? undefined : handoffFromRow(rows[0])
  }

  async findByIntegration(integrationId: string): Promise<HandoffRecord | undefined> {
    const rows = await this.sql`SELECT * FROM evergreen.handoffs WHERE integration_id = ${integrationId}`
    return rows[0] === undefined ? undefined : handoffFromRow(rows[0])
  }

  async listByGoal(goalId: string): Promise<HandoffRecord[]> {
    const rows = await this.sql`SELECT * FROM evergreen.handoffs WHERE goal_id = ${goalId} ORDER BY created_at ASC`
    return rows.map(handoffFromRow)
  }
}
