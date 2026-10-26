/** @module Projection HTTP server construction contracts. */

import type { ProjectionConsumer } from "../projection-consumer"
import type { ProjectionDatabase } from "../persistence/projection-database"

export interface ProjectionServerOptions {
  consumer: ProjectionConsumer
  database: ProjectionDatabase
  port: number
}
