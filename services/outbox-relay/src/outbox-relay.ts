/** @module Polling and publishing lifecycle for committed outbox records. */

import { EventEmitter } from "node:events"
import type { KafkaEventPublisher } from "./kafka-event-publisher"
import type { OutboxRelayDatabase } from "./persistence/outbox-relay-database"
import type { OutboxRelayOptions } from "./outbox-relay.types"

export class OutboxRelay extends EventEmitter {
  readonly #batchSize: number
  readonly #database: OutboxRelayDatabase
  readonly #intervalMs: number
  readonly #publisher: KafkaEventPublisher
  #interval: ReturnType<typeof setInterval> | undefined
  #lastFailureAt = 0
  #running = false

  constructor(options: OutboxRelayOptions) {
    super()
    this.#batchSize = options.batchSize ?? 100
    this.#database = options.database
    this.#intervalMs = options.intervalMs ?? 250
    this.#publisher = options.publisher
  }

  start(): void {
    if (this.#interval !== undefined) {
      return
    }
    this.#interval = setInterval(() => void this.flush(), this.#intervalMs)
    this.emit("relay:started")
  }

  stop(): void {
    if (this.#interval === undefined) {
      return
    }
    clearInterval(this.#interval)
    this.#interval = undefined
    this.emit("relay:stopped")
  }

  async flush(): Promise<void> {
    if (this.#running) {
      return
    }

    this.#running = true
    try {
      let published: number
      do {
        published = await this.#database.publishBatch((row) => this.#publisher.publish(row), this.#batchSize)
      } while (published === this.#batchSize)
    } catch (error) {
      const now = Date.now()
      if (now - this.#lastFailureAt >= 5_000) {
        this.#lastFailureAt = now
        this.emit("relay:failed", error)
        console.error(
          JSON.stringify({
            event: "outbox.relay_failed",
            message: error instanceof Error ? error.message : "unknown error"
          })
        )
      }
    } finally {
      this.#running = false
    }
  }
}
