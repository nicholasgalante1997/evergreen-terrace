/** @module Outbox relay lifecycle contracts. */

import type { KafkaEventPublisher } from "./kafka-event-publisher"
import type { OutboxRelayDatabase } from "./persistence/outbox-relay-database"

export interface OutboxRelayOptions {
  database: OutboxRelayDatabase
  publisher: KafkaEventPublisher
  batchSize?: number
  intervalMs?: number
}
