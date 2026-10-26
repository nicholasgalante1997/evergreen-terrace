/** @module Read-model projection-watermark repository. */

import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { SQL } from "bun"
import type { ProjectionFreshness } from "./projection-freshness-repository.types"

export class ProjectionFreshnessRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  async getConsoleFreshness(): Promise<ProjectionFreshness | null> {
    const rows = await this.sql`
      SELECT projection_name, event_id, occurred_at, applied_at
      FROM evergreen_read.projection_freshness
      WHERE projection_name = ${"console"}
    `
    return rows[0] ?? null
  }
}
