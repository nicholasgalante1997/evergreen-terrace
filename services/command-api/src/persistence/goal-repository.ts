/** @module Goal command-state repository. */

import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { SQL } from "bun"
import type { GoalSummary, StoredGoal } from "./goal-repository.types"

export class GoalRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  async create(goal: StoredGoal): Promise<boolean> {
    const inserted = await this.sql`
      INSERT INTO evergreen.goals (
        id, project_id, title, description, priority_class, base_ref, base_sha, idempotency_key, created_event_id
      )
      VALUES (
        ${goal.id}, ${goal.projectId}, ${goal.title}, ${goal.description}, ${goal.priorityClass},
        ${goal.baseRef}, ${goal.baseSha}, ${goal.idempotencyKey}, ${goal.createdEventId}
      )
      ON CONFLICT (project_id, idempotency_key) DO NOTHING
      RETURNING id
    `
    return inserted[0] !== undefined
  }

  async findByIdempotency(
    projectId: string,
    idempotencyKey: string
  ): Promise<{ createdEventId: string; id: string } | undefined> {
    const rows = await this.sql`
      SELECT id, created_event_id
      FROM evergreen.goals
      WHERE project_id = ${projectId} AND idempotency_key = ${idempotencyKey}
    `
    const row = rows[0]
    return row === undefined ? undefined : { createdEventId: String(row.created_event_id), id: String(row.id) }
  }

  async findProjectId(id: string): Promise<string | undefined> {
    const rows = await this.sql`SELECT project_id FROM evergreen.goals WHERE id = ${id}`
    return rows[0] === undefined ? undefined : String(rows[0].project_id)
  }

  async findById(id: string): Promise<GoalSummary | undefined> {
    const rows = await this.sql`
      SELECT id, project_id, title, priority_class, base_ref, base_sha, state, created_at
      FROM evergreen.goals
      WHERE id = ${id}
    `
    return rows[0] as GoalSummary | undefined
  }

  async list(projectId: string | null): Promise<GoalSummary[]> {
    return projectId === null
      ? this.sql`
          SELECT id, project_id, title, priority_class, base_ref, base_sha, state, created_at
          FROM evergreen.goals
          ORDER BY created_at DESC
        `
      : this.sql`
          SELECT id, project_id, title, priority_class, base_ref, base_sha, state, created_at
          FROM evergreen.goals
          WHERE project_id = ${projectId}
          ORDER BY created_at DESC
        `
  }
}
