/** @module Read-model decision repository. */

import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { SQL } from "bun"
import { readDecisionFromRow } from "./decision-read-row"
import type { ReadDecision } from "./decision-read-repository.types"

export class DecisionReadRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  async list(projectId: string | null): Promise<ReadDecision[]> {
    const rows =
      projectId === null
        ? await this.sql`SELECT * FROM evergreen_read.decisions ORDER BY requested_at DESC`
        : await this.sql`
          SELECT * FROM evergreen_read.decisions WHERE project_id = ${projectId} ORDER BY requested_at DESC
        `
    return rows.map(readDecisionFromRow)
  }
}
