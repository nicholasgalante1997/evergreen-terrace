/** @module Command-decision aggregate repository. */

import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { DecisionResolution } from "@evergreen-terrace/contracts"
import type { SQL } from "bun"
import { decisionRecordFromRow } from "./decision-row"
import type { CommandDecisionSummary, DecisionRecord, NewDecision } from "./decision-repository.types"

export class DecisionRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  async create(decision: NewDecision): Promise<boolean> {
    const inserted = await this.sql`
      INSERT INTO evergreen.decisions (
        id, project_id, goal_id, category, title, context, options, recommended_option_id,
        idempotency_key, status, requested_event_id
      )
      VALUES (
        ${decision.id}, ${decision.request.projectId}, ${decision.request.goalId}, ${decision.request.category},
        ${decision.request.title}, ${decision.request.context}, ${JSON.stringify(decision.request.options)}::text::jsonb,
        ${decision.request.recommendedOptionId}, ${decision.request.idempotencyKey}, ${"requested"},
        ${decision.requestedEventId}
      )
      ON CONFLICT (project_id, idempotency_key) DO NOTHING
      RETURNING id
    `
    return inserted[0] !== undefined
  }

  async findById(id: string): Promise<DecisionRecord | undefined> {
    const rows = await this.sql`SELECT * FROM evergreen.decisions WHERE id = ${id}`
    return rows[0] === undefined ? undefined : decisionRecordFromRow(rows[0])
  }

  async findByIdForUpdate(id: string): Promise<DecisionRecord | undefined> {
    const rows = await this.sql`SELECT * FROM evergreen.decisions WHERE id = ${id} FOR UPDATE`
    return rows[0] === undefined ? undefined : decisionRecordFromRow(rows[0])
  }

  async findByIdempotency(projectId: string, idempotencyKey: string): Promise<DecisionRecord | undefined> {
    const rows = await this.sql`
      SELECT * FROM evergreen.decisions
      WHERE project_id = ${projectId} AND idempotency_key = ${idempotencyKey}
    `
    return rows[0] === undefined ? undefined : decisionRecordFromRow(rows[0])
  }

  async list(projectId: string | null): Promise<CommandDecisionSummary[]> {
    return projectId === null
      ? this.sql`
          SELECT id, project_id, goal_id, category, title, status, created_at, updated_at
          FROM evergreen.decisions ORDER BY created_at DESC
        `
      : this.sql`
          SELECT id, project_id, goal_id, category, title, status, created_at, updated_at
          FROM evergreen.decisions WHERE project_id = ${projectId} ORDER BY created_at DESC
        `
  }

  async resolve(id: string, resolution: DecisionResolution, resolvedEventId: string): Promise<void> {
    await this.sql`
      UPDATE evergreen.decisions
      SET status = ${resolution.status}, resolution = ${JSON.stringify(resolution)}::text::jsonb,
          resolved_event_id = ${resolvedEventId}, resolved_at = now(), updated_at = now()
      WHERE id = ${id} AND status = ${"requested"}
    `
  }
}
