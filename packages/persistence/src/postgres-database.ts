/** @module Event-emitting PostgreSQL database and repository base classes. */

import { EventEmitter } from "node:events"
import { SQL } from "bun"
import type { PostgresDatabaseOptions } from "./postgres-database.types"

/** Lifecycle owner for one bounded PostgreSQL database responsibility. */
export abstract class PostgresDatabase extends EventEmitter {
  #connected = false
  #closed = false
  protected readonly sql: SQL

  protected constructor(options: PostgresDatabaseOptions) {
    super()
    this.sql = new SQL(options.url, {
      connection: { application_name: options.applicationName, ...options.session },
      idleTimeout: 30,
      max: options.connectionLimit ?? 10
    })
  }

  get connected(): boolean {
    return this.#connected
  }

  async connect(): Promise<void> {
    if (this.#closed) {
      throw new Error("Cannot connect a closed database")
    }
    if (this.#connected) {
      return
    }

    try {
      await this.migrate()
      await this.sql`SELECT 1`
      this.#connected = true
      this.emit("database:connected")
    } catch (error) {
      this.emit("database:connection_failed", error)
      throw error
    }
  }

  async check(): Promise<void> {
    await this.sql`SELECT 1`
  }

  async transaction<T>(work: (transaction: SQL) => Promise<T>): Promise<T> {
    if (!this.#connected) {
      throw new Error("Database must connect before starting a transaction")
    }
    return this.sql.begin(work)
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return
    }

    this.#closed = true
    this.#connected = false
    await this.sql.close({ timeout: 5 })
    this.emit("database:closed")
  }

  protected abstract migrate(): Promise<void>
}

/** Base class for a repository scoped to a database or transaction executor. */
export abstract class PostgresRepository {
  protected constructor(protected readonly sql: SQL) {}
}
