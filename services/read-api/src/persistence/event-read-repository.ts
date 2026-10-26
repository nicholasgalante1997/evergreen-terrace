/** @module Read-model event-stream repository: what happened, newest first, without payload bodies. */

import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { SQL } from "bun"
import type { ReadEvent } from "./event-read-repository.types"

export class EventReadRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  /** Envelope metadata only; payloads are read through their aggregate's own endpoint. */
  async listRecent(limit: number): Promise<ReadEvent[]> {
    const rows = await this.sql`
      SELECT event_id, event_type, aggregate_type, aggregate_id, occurred_at, applied_at,
             envelope->'actor' AS actor, (envelope->'aggregate'->>'sequence')::int AS sequence
      FROM evergreen_read.events
      ORDER BY occurred_at DESC
      LIMIT ${limit}
    `
    return rows.map((row: Record<string, unknown>) => ({
      actor: (typeof row.actor === "string" ? JSON.parse(row.actor) : row.actor) as ReadEvent["actor"],
      aggregateId: String(row.aggregate_id),
      aggregateType: String(row.aggregate_type),
      appliedAt: new Date(String(row.applied_at)),
      eventId: String(row.event_id),
      eventType: String(row.event_type),
      occurredAt: new Date(String(row.occurred_at)),
      sequence: Number(row.sequence)
    }))
  }
}
