/** @module Projection service health HTTP server. */

import { HttpServer, jsonError } from "@evergreen-terrace/service-runtime"
import type { ProjectionConsumer } from "../projection-consumer"
import type { ProjectionDatabase } from "../persistence/projection-database"
import type { ProjectionServerOptions } from "./projection-server.types"

export class ProjectionServer extends HttpServer {
  constructor(options: ProjectionServerOptions) {
    super({
      service: "projection",
      port: options.port,
      readinessChecks: [
        { name: "read-database", check: () => options.database.check() },
        { name: "kafka-topic", check: () => options.consumer.check() }
      ]
    })
  }

  protected handleRequest(): Response {
    return jsonError(404, "not_found", "Route not found")
  }
}
