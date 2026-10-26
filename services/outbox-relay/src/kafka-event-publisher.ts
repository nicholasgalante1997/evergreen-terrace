/** @module Kafka publisher for validated transactional-outbox events. */

import { EventEmitter } from "node:events"
import { Kafka, logLevel } from "kafkajs"
import { eventFromOutboxRow } from "./persistence/outbox-relay-repository"
import type { OutboxRow } from "./persistence/outbox-relay-repository.types"

const eventTopic = "evergreen.events.v1"

const brokersFromEnvironment = (value: string): string[] => {
  const brokers = value
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean)
  if (brokers.length === 0) {
    throw new Error("ET_KAFKA_BROKERS must contain at least one broker")
  }
  return brokers
}

export class KafkaEventPublisher extends EventEmitter {
  readonly #admin
  readonly #producer

  constructor(brokers: string) {
    super()
    const kafka = new Kafka({
      clientId: "evergreen-outbox-relay",
      brokers: brokersFromEnvironment(brokers),
      logLevel: logLevel.NOTHING
    })
    this.#producer = kafka.producer({ allowAutoTopicCreation: false, idempotent: true })
    this.#admin = kafka.admin()
  }

  async connect(): Promise<void> {
    await Promise.all([this.#producer.connect(), this.#admin.connect()])
    await this.check()
    this.emit("publisher:connected")
  }

  async check(): Promise<void> {
    await this.#admin.fetchTopicMetadata({ topics: [eventTopic] })
  }

  async publish(row: OutboxRow): Promise<void> {
    const event = eventFromOutboxRow(row)
    await this.#producer.send({
      acks: -1,
      topic: row.topic,
      messages: [
        {
          key: row.partition_key,
          value: JSON.stringify(event),
          headers: {
            "event-id": event.eventId,
            "event-type": event.eventType,
            "schema-version": String(event.schemaVersion)
          }
        }
      ]
    })
    this.emit("event:published", { eventId: event.eventId, topic: row.topic })
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.#producer.disconnect(), this.#admin.disconnect()])
    this.emit("publisher:closed")
  }
}
