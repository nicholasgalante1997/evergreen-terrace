/** @module Read-model worker repository. */

import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { SQL } from "bun"
import { readWorkerFromRow } from "./worker-read-row"
import type { ReadWorker } from "./worker-read-repository.types"

export class WorkerReadRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  async list(projectId: string | null): Promise<ReadWorker[]> {
    const rows =
      projectId === null
        ? await this.sql`SELECT * FROM evergreen_read.workers ORDER BY updated_at DESC`
        : await this.sql`
          SELECT * FROM evergreen_read.workers WHERE project_id = ${projectId} ORDER BY updated_at DESC
        `
    return rows.map(readWorkerFromRow)
  }
}
