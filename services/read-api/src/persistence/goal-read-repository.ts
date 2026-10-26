/** @module Read-model goal repository. */

import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { SQL } from "bun"
import type { ReadGoal } from "./goal-read-repository.types"

export class GoalReadRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  async list(projectId: string | null): Promise<ReadGoal[]> {
    return projectId === null
      ? this.sql`
          SELECT id, project_id, title, description, priority_class, base_ref, base_sha, state, submitted_at, updated_at
          FROM evergreen_read.goals
          ORDER BY submitted_at DESC
        `
      : this.sql`
          SELECT id, project_id, title, description, priority_class, base_ref, base_sha, state, submitted_at, updated_at
          FROM evergreen_read.goals
          WHERE project_id = ${projectId}
          ORDER BY submitted_at DESC
        `
  }
}
