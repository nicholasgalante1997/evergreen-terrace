/** @module Repository-onboarding aggregate repository. */

import {
  onboardingDiscoverySessionSchema,
  onboardingPacketSchema,
  onboardingResultSchema,
  onboardingStatusSchema
} from "@evergreen-terrace/contracts"
import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { SQL } from "bun"
import type { OnboardingChange, OnboardingRecord } from "./onboarding-repository.types"

const jsonValue = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value)
const json = (value: unknown): string | null => (value === null ? null : JSON.stringify(value))

const onboardingFromRow = (row: Record<string, unknown>): OnboardingRecord => ({
  createdAt: new Date(String(row.created_at)),
  decisionId: row.decision_id === null ? null : String(row.decision_id),
  detail: String(row.detail),
  discovery: onboardingDiscoverySessionSchema.parse(jsonValue(row.discovery)),
  feedback: String(row.feedback),
  id: String(row.id),
  idempotencyKey: String(row.idempotency_key),
  lastEventId: String(row.last_event_id),
  packet: row.packet === null ? null : onboardingPacketSchema.parse(jsonValue(row.packet)),
  projectId: String(row.project_id),
  result: row.result === null ? null : onboardingResultSchema.parse(jsonValue(row.result)),
  revision: Number(row.revision),
  revisionOf: row.revision_of === null ? null : String(row.revision_of),
  sequence: Number(row.aggregate_sequence),
  status: onboardingStatusSchema.parse(row.status),
  updatedAt: new Date(String(row.updated_at))
})

export class OnboardingRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  async create(
    record: Pick<
      OnboardingRecord,
      | "discovery"
      | "feedback"
      | "id"
      | "idempotencyKey"
      | "lastEventId"
      | "projectId"
      | "revision"
      | "revisionOf"
      | "sequence"
    >
  ): Promise<void> {
    await this.sql`
      INSERT INTO evergreen.onboardings (
        id, project_id, revision, revision_of, feedback, status, detail, discovery, idempotency_key,
        aggregate_sequence, last_event_id
      )
      VALUES (
        ${record.id}, ${record.projectId}, ${record.revision}, ${record.revisionOf}, ${record.feedback}, ${"discovering"},
        ${""}, ${JSON.stringify(record.discovery)}::text::jsonb, ${record.idempotencyKey}, ${record.sequence},
        ${record.lastEventId}
      )
    `
  }

  async update(id: string, change: OnboardingChange): Promise<void> {
    const updated = await this.sql`
      UPDATE evergreen.onboardings
      SET status = ${change.status}, detail = ${change.detail}, decision_id = ${change.decisionId},
          packet = ${json(change.packet)}::text::jsonb, result = ${json(change.result)}::text::jsonb,
          last_event_id = ${change.eventId}, aggregate_sequence = ${change.sequence}, updated_at = now()
      WHERE id = ${id} AND aggregate_sequence = ${change.sequence - 1}
      RETURNING id
    `
    if (updated[0] === undefined) {
      throw new Error(`Onboarding ${id} changed concurrently`)
    }
  }

  async findById(id: string): Promise<OnboardingRecord | undefined> {
    const rows = await this.sql`SELECT * FROM evergreen.onboardings WHERE id = ${id}`
    return rows[0] === undefined ? undefined : onboardingFromRow(rows[0])
  }

  async findByIdForUpdate(id: string): Promise<OnboardingRecord | undefined> {
    const rows = await this.sql`SELECT * FROM evergreen.onboardings WHERE id = ${id} FOR UPDATE`
    return rows[0] === undefined ? undefined : onboardingFromRow(rows[0])
  }

  async findByIdempotency(projectId: string, idempotencyKey: string): Promise<OnboardingRecord | undefined> {
    const rows = await this.sql`
      SELECT * FROM evergreen.onboardings WHERE project_id = ${projectId} AND idempotency_key = ${idempotencyKey}
    `
    return rows[0] === undefined ? undefined : onboardingFromRow(rows[0])
  }

  /** Serializes onboarding per project: the advisory lock covers a project's first record too. */
  async lockProject(projectId: string): Promise<void> {
    await this.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`onboarding:${projectId}`}, 0))`
  }

  async findLatestForProject(projectId: string): Promise<OnboardingRecord | undefined> {
    const rows = await this.sql`
      SELECT * FROM evergreen.onboardings WHERE project_id = ${projectId} ORDER BY revision DESC LIMIT 1
    `
    return rows[0] === undefined ? undefined : onboardingFromRow(rows[0])
  }

  async listByProject(projectId: string): Promise<OnboardingRecord[]> {
    const rows = await this.sql`SELECT * FROM evergreen.onboardings WHERE project_id = ${projectId} ORDER BY revision ASC`
    return rows.map(onboardingFromRow)
  }
}
