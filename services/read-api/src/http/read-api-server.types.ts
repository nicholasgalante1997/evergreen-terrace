/** @module Read API HTTP server construction contracts. */

import type { ReadDatabase } from "../persistence/read-database"

export interface ReadApiServerOptions {
  database: ReadDatabase
  port: number
}
