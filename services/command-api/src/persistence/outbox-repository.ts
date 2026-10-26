/** @module Transactional outbox persistence. */

import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { EventEnvelope } from "@evergreen-terrace/contracts"
import type { SQL } from "bun"

const outboxTopic = "evergreen.events.v1"

export class OutboxRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  async enqueue(event: EventEnvelope): Promise<void> {
    await this.sql`
      INSERT INTO evergreen.outbox (event_id, topic, partition_key, envelope, occurred_at)
      VALUES (
        ${event.eventId}, ${outboxTopic}, ${event.aggregate.id}, ${JSON.stringify(event)}::text::jsonb, ${event.occurredAt}
      )
    `
  }
}
