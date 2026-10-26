/** @module Command API HTTP server construction contracts. */

import type { CommandDatabase } from "../persistence/command-database"

export interface CommandApiServerOptions {
  database: CommandDatabase
  port: number
}
