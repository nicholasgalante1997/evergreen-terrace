/** @module Outbox relay health HTTP server. */

import { HttpServer, jsonError } from "@evergreen-terrace/service-runtime"
import type { KafkaEventPublisher } from "../kafka-event-publisher"
import type { OutboxRelayDatabase } from "../persistence/outbox-relay-database"
import type { OutboxRelayServerOptions } from "./outbox-relay-server.types"

export class OutboxRelayServer extends HttpServer {
  constructor(options: OutboxRelayServerOptions) {
    super({
      service: "outbox-relay",
      port: options.port,
      readinessChecks: [
        { name: "command-database", check: () => options.database.check() },
        { name: "kafka-topic", check: () => options.publisher.check() }
      ]
    })
  }

  protected handleRequest(): Response {
    return jsonError(404, "not_found", "Route not found")
  }
}
