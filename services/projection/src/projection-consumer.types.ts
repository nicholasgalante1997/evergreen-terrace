/** @module Kafka projection-consumer construction contracts. */

import type { ProjectionDatabase } from "./persistence/projection-database"

export interface ProjectionConsumerOptions {
  brokers: string
  database: ProjectionDatabase
}
