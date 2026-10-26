/** @module Idempotent Kafka-to-read-model projection consumer. */

import { EventEmitter } from "node:events"
import { eventEnvelopeSchema } from "@evergreen-terrace/contracts"
import { Kafka, logLevel } from "kafkajs"
import type { ProjectionDatabase } from "./persistence/projection-database"
import type { ProjectionConsumerOptions } from "./projection-consumer.types"

const consumerGroup = "evergreen-projection-v1"
const eventTopic = "evergreen.events.v1"

const parseBrokers = (value: string): string[] => {
  const brokers = value
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean)
  if (brokers.length === 0) {
    throw new Error("ET_KAFKA_BROKERS must contain at least one broker")
  }
  return brokers
}

export class ProjectionConsumer extends EventEmitter {
  readonly #admin
  readonly #consumer
  readonly #database: ProjectionDatabase
  #failure: Error | undefined

  constructor(options: ProjectionConsumerOptions) {
    super()
    this.#database = options.database
    const kafka = new Kafka({
      clientId: "evergreen-projection",
      brokers: parseBrokers(options.brokers),
      logLevel: logLevel.NOTHING
    })
    this.#admin = kafka.admin()
    this.#consumer = kafka.consumer({ groupId: consumerGroup, allowAutoTopicCreation: false })
  }

  async connect(): Promise<void> {
    await Promise.all([this.#consumer.connect(), this.#admin.connect()])
    await this.check()
    await this.#consumer.subscribe({ topic: eventTopic, fromBeginning: true })
    this.emit("consumer:connected")
  }

  async start(): Promise<void> {
    await this.#consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }): Promise<void> => {
        try {
          if (message.value === null) {
            throw new Error("Event messages must have a value")
          }
          const event = eventEnvelopeSchema.parse(JSON.parse(new TextDecoder().decode(message.value)) as unknown)
          const nextOffset = (BigInt(message.offset) + 1n).toString()
          await this.#database.applyEvent(event, topic, partition, nextOffset)
          await this.#consumer.commitOffsets([{ topic, partition, offset: nextOffset }])
          this.emit("event:projected", { eventId: event.eventId, topic, partition })
        } catch (error) {
          this.#failure = error instanceof Error ? error : new Error(String(error))
          this.emit("consumer:failed", { error: this.#failure, partition, topic })
          throw error
        }
      }
    })
    this.emit("consumer:started")
  }

  async check(): Promise<void> {
    if (this.#failure !== undefined) {
      throw this.#failure
    }
    await this.#admin.fetchTopicMetadata({ topics: [eventTopic] })
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.#consumer.disconnect(), this.#admin.disconnect()])
    this.emit("consumer:closed")
  }
}
