/** @module PostgreSQL database lifecycle contracts. */

export interface PostgresDatabaseOptions {
  applicationName: string
  connectionLimit?: number
  session?: Record<string, string>
  url: string
}
