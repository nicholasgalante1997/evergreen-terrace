/** @module Read-model validation and integration evidence repository. */

import {
  handoffPlanSchema,
  handoffResultSchema,
  integrationCompletionSchema,
  validationRecordSchema
} from "@evergreen-terrace/contracts"
import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { SQL } from "bun"
import type { ReadHandoff, ReadIntegration, ReadValidation } from "./evidence-read-repository.types"

const jsonValue = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value)

const readValidation = (row: Record<string, unknown>): ReadValidation => {
  const { id: _id, ...record } = jsonValue(row.record) as Record<string, unknown>
  return { ...validationRecordSchema.parse(record), id: String(row.id) }
}

const readIntegration = (row: Record<string, unknown>): ReadIntegration => ({
  attempt: Number(row.attempt),
  base_ref: String(row.base_ref),
  base_sha: String(row.base_sha),
  completion: row.completion === null ? null : integrationCompletionSchema.parse(jsonValue(row.completion)),
  goal_id: String(row.goal_id),
  id: String(row.id),
  project_id: String(row.project_id),
  resolves_integration_id: row.resolves_integration_id === null || row.resolves_integration_id === undefined ? null : String(row.resolves_integration_id),
  started_at: new Date(String(row.started_at)),
  status: String(row.status),
  updated_at: new Date(String(row.updated_at))
})

const readHandoff = (row: Record<string, unknown>): ReadHandoff => ({
  decision_id: String(row.decision_id),
  detail: String(row.detail),
  goal_id: String(row.goal_id),
  id: String(row.id),
  integration_id: String(row.integration_id),
  plan: handoffPlanSchema.parse(jsonValue(row.plan)),
  project_id: String(row.project_id),
  requested_at: new Date(String(row.requested_at)),
  result: row.result === null ? null : handoffResultSchema.parse(jsonValue(row.result)),
  status: String(row.status),
  updated_at: new Date(String(row.updated_at))
})

export class EvidenceReadRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  async listValidations(projectId: string | null): Promise<ReadValidation[]> {
    const rows =
      projectId === null
        ? await this.sql`SELECT id, record FROM evergreen_read.validations ORDER BY completed_at DESC`
        : await this.sql`
            SELECT id, record FROM evergreen_read.validations WHERE project_id = ${projectId} ORDER BY completed_at DESC
          `
    return rows.map(readValidation)
  }

  async listHandoffs(projectId: string | null): Promise<ReadHandoff[]> {
    const rows =
      projectId === null
        ? await this.sql`SELECT * FROM evergreen_read.handoffs ORDER BY updated_at DESC`
        : await this.sql`SELECT * FROM evergreen_read.handoffs WHERE project_id = ${projectId} ORDER BY updated_at DESC`
    return rows.map(readHandoff)
  }

  async listIntegrations(projectId: string | null): Promise<ReadIntegration[]> {
    const rows =
      projectId === null
        ? await this.sql`SELECT * FROM evergreen_read.integrations ORDER BY updated_at DESC`
        : await this.sql`
            SELECT * FROM evergreen_read.integrations WHERE project_id = ${projectId} ORDER BY updated_at DESC
          `
    return rows.map(readIntegration)
  }
}
