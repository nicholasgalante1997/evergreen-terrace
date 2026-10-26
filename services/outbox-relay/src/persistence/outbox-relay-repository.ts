/** @module Locked transactional-outbox row repository. */

import { eventEnvelopeSchema } from "@evergreen-terrace/contracts"
import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { EventEnvelope } from "@evergreen-terrace/contracts"
import type { SQL } from "bun"
import { z } from "zod"
import { parseJsonColumn } from "../serialization"
import type { OutboxRow } from "./outbox-relay-repository.types"

const outboxRowSchema = z
  .object({
    id: z.coerce.number().int().positive(),
    event_id: z.string().uuid(),
    topic: z.string().min(1),
    partition_key: z.string().min(1),
    envelope: z.preprocess(parseJsonColumn, eventEnvelopeSchema)
  })
  .strict()

export class OutboxRelayRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  async lockUnpublished(limit: number): Promise<OutboxRow[]> {
    return outboxRowSchema.array().parse(
      await this.sql`
        SELECT id, event_id, topic, partition_key, envelope
        FROM evergreen.outbox
        WHERE published_at IS NULL
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      `
    )
  }

  async markPublished(id: number): Promise<void> {
    await this.sql`
      UPDATE evergreen.outbox
      SET published_at = now(), publish_attempts = publish_attempts + 1, last_error = NULL
      WHERE id = ${id}
    `
  }
}

export const eventFromOutboxRow = (row: OutboxRow): EventEnvelope => eventEnvelopeSchema.parse(row.envelope)
