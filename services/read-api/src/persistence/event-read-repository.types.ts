/** @module Read-model event-stream contracts. */

export interface ReadEvent {
  actor: { id: string; kind: string }
  aggregateId: string
  aggregateType: string
  appliedAt: Date
  eventId: string
  eventType: string
  occurredAt: Date
  sequence: number
}
