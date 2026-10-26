/** @module Outbox relay HTTP server construction contracts. */

import type { KafkaEventPublisher } from "../kafka-event-publisher"
import type { OutboxRelayDatabase } from "../persistence/outbox-relay-database"

export interface OutboxRelayServerOptions {
  database: OutboxRelayDatabase
  port: number
  publisher: KafkaEventPublisher
}
