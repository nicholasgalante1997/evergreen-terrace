/** @module Transactional-outbox row model. */

import type { EventEnvelope } from "@evergreen-terrace/contracts"

export interface OutboxRow {
  envelope: EventEnvelope
  event_id: string
  id: number
  partition_key: string
  topic: string
}
