import pino from "pino"
import createDebug from "debug"
import { Database } from "bun:sqlite"

export type ServiceLogger = {
  log: pino.Logger
  dbg: ReturnType<typeof createDebug>
}

function sqliteDestination(dbPath: string): pino.DestinationStream {
  const db = new Database(dbPath, { create: true })
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          TEXT    NOT NULL,
      level       INTEGER NOT NULL,
      service     TEXT    NOT NULL,
      msg         TEXT    NOT NULL,
      data        TEXT,
      inserted_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_logs_service ON logs (service);
    CREATE INDEX IF NOT EXISTS idx_logs_ts      ON logs (ts);
  `)
  const stmt = db.prepare("INSERT INTO logs (ts, level, service, msg, data) VALUES (?, ?, ?, ?, ?)")
  return {
    write(raw: string): void {
      try {
        const entry = JSON.parse(raw) as {
          time: number
          level: number
          name?: string
          msg: string
          [k: string]: unknown
        }
        const { time, level, name, msg, ...rest } = entry
        const data = Object.keys(rest).length > 0 ? JSON.stringify(rest) : null
        stmt.run(new Date(time).toISOString(), level, name ?? "unknown", msg, data)
      } catch {
        // never let a logging failure crash the process
      }
    }
  }
}

export function createLogger(service: string): ServiceLogger {
  const level = process.env["LOG_LEVEL"] ?? "info"
  const base: pino.LoggerOptions = {
    name: service,
    level,
    formatters: { level: (label) => ({ level: label }) }
  }

  const logFile = process.env["LOG_FILE"]
  const logDb = process.env["LOG_DB"]

  if (!logFile && !logDb) {
    return { log: pino(base), dbg: createDebug(`et:${service}`) }
  }

  const streams: pino.DestinationStream[] = [pino.destination(1)]

  if (logFile) {
    streams.push(
      pino.destination({ dest: logFile.replace("{service}", service), sync: false, append: true })
    )
  }

  if (logDb) {
    streams.push(sqliteDestination(logDb))
  }

  return {
    log: pino(base, pino.multistream(streams.map((stream) => ({ stream })))),
    dbg: createDebug(`et:${service}`)
  }
}
