/** @module Immutable command-event persistence. */

import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { EventEnvelope } from "@evergreen-terrace/contracts"
import type { SQL } from "bun"

export class EventStore extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  async append(event: EventEnvelope): Promise<void> {
    await this.sql`
      INSERT INTO evergreen.events (
        event_id, event_type, schema_version, aggregate_type, aggregate_id, aggregate_sequence,
        correlation_id, causation_id, occurred_at, envelope
      )
      VALUES (
        ${event.eventId}, ${event.eventType}, ${event.schemaVersion}, ${event.aggregate.type},
        ${event.aggregate.id}, ${event.aggregate.sequence}, ${event.correlationId}, ${event.causationId},
        ${event.occurredAt}, ${JSON.stringify(event)}::text::jsonb
      )
    `
  }
}
