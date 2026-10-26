/** @module Command-side database adapter for outbox publication. */

import { PostgresDatabase } from "@evergreen-terrace/persistence"
import { OutboxRelayRepository } from "./outbox-relay-repository"
import type { OutboxRow } from "./outbox-relay-repository.types"

export class OutboxRelayDatabase extends PostgresDatabase {
  constructor(url: string) {
    super({ applicationName: "evergreen-outbox-relay", connectionLimit: 4, url })
  }

  async publishBatch(publish: (row: OutboxRow) => Promise<void>, batchSize: number): Promise<number> {
    return this.transaction(async (transaction) => {
      const outbox = new OutboxRelayRepository(transaction)
      const rows = await outbox.lockUnpublished(batchSize)
      for (const row of rows) {
        await publish(row)
        await outbox.markPublished(row.id)
      }
      return rows.length
    })
  }

  protected async migrate(): Promise<void> {
    // The command API owns the command schema. The relay has no migration authority.
  }
}
