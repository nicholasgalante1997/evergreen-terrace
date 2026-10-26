/** @module Mayor goal-plan aggregate repository. */

import {
  mayorPlanSchema,
  planLaunchCompletionSchema,
  planMayorSessionSchema,
  planOverlapSchema,
  planStatusSchema,
  riskCategorySchema
} from "@evergreen-terrace/contracts"
import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { SQL } from "bun"
import { z } from "zod"
import type { PlanChange, PlanRecord } from "./plan-repository.types"

const jsonValue = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value)
const json = (value: unknown): string | null => (value === null ? null : JSON.stringify(value))

const planFromRow = (row: Record<string, unknown>): PlanRecord => ({
  createdAt: new Date(String(row.created_at)),
  decisionId: row.decision_id === null ? null : String(row.decision_id),
  detail: String(row.detail),
  feedback: String(row.feedback),
  flaggedRisks: z.array(riskCategorySchema).parse(jsonValue(row.flagged_risks)),
  goalId: String(row.goal_id),
  id: String(row.id),
  idempotencyKey: String(row.idempotency_key),
  lastEventId: String(row.last_event_id),
  launch: row.launch === null ? null : planLaunchCompletionSchema.parse(jsonValue(row.launch)),
  mayor: planMayorSessionSchema.parse(jsonValue(row.mayor)),
  overlaps: z.array(planOverlapSchema).parse(jsonValue(row.scope_overlaps)),
  projectId: String(row.project_id),
  proposal: row.proposal === null ? null : mayorPlanSchema.parse(jsonValue(row.proposal)),
  questionDecisionIds: z.array(z.string().uuid()).parse(jsonValue(row.question_decision_ids)),
  revision: Number(row.revision),
  revisionOf: row.revision_of === null ? null : String(row.revision_of),
  sequence: Number(row.aggregate_sequence),
  status: planStatusSchema.parse(row.status),
  updatedAt: new Date(String(row.updated_at))
})

export class PlanRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  async create(
    record: Pick<
      PlanRecord,
      | "feedback"
      | "goalId"
      | "id"
      | "idempotencyKey"
      | "lastEventId"
      | "mayor"
      | "projectId"
      | "revision"
      | "revisionOf"
      | "sequence"
    >
  ): Promise<void> {
    await this.sql`
      INSERT INTO evergreen.plans (
        id, project_id, goal_id, revision, revision_of, feedback, status, detail, mayor, idempotency_key,
        aggregate_sequence, last_event_id
      )
      VALUES (
        ${record.id}, ${record.projectId}, ${record.goalId}, ${record.revision}, ${record.revisionOf}, ${record.feedback},
        ${"drafting"}, ${""}, ${JSON.stringify(record.mayor)}::text::jsonb, ${record.idempotencyKey},
        ${record.sequence}, ${record.lastEventId}
      )
    `
  }

  async update(id: string, change: PlanChange): Promise<void> {
    const updated = await this.sql`
      UPDATE evergreen.plans
      SET status = ${change.status}, detail = ${change.detail}, decision_id = ${change.decisionId},
          proposal = ${json(change.proposal)}::text::jsonb,
          scope_overlaps = ${JSON.stringify(change.overlaps)}::text::jsonb,
          flagged_risks = ${JSON.stringify(change.flaggedRisks)}::text::jsonb,
          question_decision_ids = ${JSON.stringify(change.questionDecisionIds)}::text::jsonb,
          launch = ${json(change.launch)}::text::jsonb,
          last_event_id = ${change.eventId}, aggregate_sequence = ${change.sequence}, updated_at = now()
      WHERE id = ${id} AND aggregate_sequence = ${change.sequence - 1}
      RETURNING id
    `
    if (updated[0] === undefined) {
      throw new Error(`Plan ${id} changed concurrently`)
    }
  }

  async findById(id: string): Promise<PlanRecord | undefined> {
    const rows = await this.sql`SELECT * FROM evergreen.plans WHERE id = ${id}`
    return rows[0] === undefined ? undefined : planFromRow(rows[0])
  }

  async findByIdForUpdate(id: string): Promise<PlanRecord | undefined> {
    const rows = await this.sql`SELECT * FROM evergreen.plans WHERE id = ${id} FOR UPDATE`
    return rows[0] === undefined ? undefined : planFromRow(rows[0])
  }

  async findByIdempotency(projectId: string, idempotencyKey: string): Promise<PlanRecord | undefined> {
    const rows = await this.sql`
      SELECT * FROM evergreen.plans WHERE project_id = ${projectId} AND idempotency_key = ${idempotencyKey}
    `
    return rows[0] === undefined ? undefined : planFromRow(rows[0])
  }

  /** Serializes drafting per goal: the advisory lock covers a goal's first plan too. */
  async lockGoal(goalId: string): Promise<void> {
    await this.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`plan:${goalId}`}, 0))`
  }

  async findLatestForGoal(goalId: string): Promise<PlanRecord | undefined> {
    const rows = await this.sql`
      SELECT * FROM evergreen.plans WHERE goal_id = ${goalId} ORDER BY revision DESC LIMIT 1
    `
    return rows[0] === undefined ? undefined : planFromRow(rows[0])
  }

  async listByGoal(goalId: string): Promise<PlanRecord[]> {
    const rows = await this.sql`SELECT * FROM evergreen.plans WHERE goal_id = ${goalId} ORDER BY revision ASC`
    return rows.map(planFromRow)
  }

  /** Plans whose scope claims are live: proposed or launched, and not yet handed off. */
  async listActiveByProject(projectId: string): Promise<PlanRecord[]> {
    const rows = await this.sql`
      SELECT p.* FROM evergreen.plans p
      WHERE p.project_id = ${projectId}
        AND p.status IN ('proposed', 'launching', 'launched')
        AND NOT EXISTS (
          SELECT 1 FROM evergreen.handoffs h WHERE h.goal_id = p.goal_id AND h.status = 'completed'
        )
      ORDER BY p.created_at ASC
    `
    return rows.map(planFromRow)
  }
}
