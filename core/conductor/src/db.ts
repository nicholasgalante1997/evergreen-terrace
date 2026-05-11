import { Database } from "bun:sqlite"
import { join } from "path"

export const DB_PATH = join(process.env["CONDUCTOR_ROOT"] ?? process.cwd(), "context/conductor.db")

export const db = new Database(DB_PATH, { create: true })

// Separate read-only connection used exclusively for the query playground.
// Even if SQL validation is bypassed, this connection cannot write.
export const readonlyDb = new Database(DB_PATH, { readonly: true })

db.exec("PRAGMA journal_mode = WAL")
db.exec("PRAGMA synchronous = NORMAL")
db.exec("PRAGMA foreign_keys = ON")

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ts              TEXT    NOT NULL,
    goal_id         TEXT    NOT NULL,
    bead_id         TEXT    NOT NULL,
    queue_item_id   TEXT    NOT NULL DEFAULT '',
    project         TEXT    NOT NULL DEFAULT '',
    type            TEXT    NOT NULL,
    content         TEXT    NOT NULL,
    meta            TEXT    DEFAULT NULL,
    inserted_at     INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_events_bead         ON events (bead_id);
  CREATE INDEX IF NOT EXISTS idx_events_goal         ON events (goal_id);
  CREATE INDEX IF NOT EXISTS idx_events_queue_item   ON events (queue_item_id);
  CREATE INDEX IF NOT EXISTS idx_events_project      ON events (project);
  CREATE INDEX IF NOT EXISTS idx_events_type         ON events (type);
  CREATE INDEX IF NOT EXISTS idx_events_inserted_at  ON events (inserted_at);
`)

export interface EventRow {
  ts: string
  goal_id: string
  bead_id: string
  queue_item_id: string
  project: string
  type: string
  content: string
  meta: string | null
}

// Positional params avoid Bun's SQLQueryBindings index-signature constraint
const insertStmt = db.prepare(
  "INSERT INTO events (ts, goal_id, bead_id, queue_item_id, project, type, content, meta) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
)

export function insertEvent(row: EventRow): void {
  insertStmt.run(row.ts, row.goal_id, row.bead_id, row.queue_item_id, row.project, row.type, row.content, row.meta)
}

export interface EventQuery {
  bead_id?: string
  goal_id?: string
  queue_item_id?: string
  project?: string
  type?: string // comma-separated for OR: "tool_use,usage"
  since?: string // ISO timestamp
  limit?: number // default 500, max 5000
  offset?: number
}

export function queryEvents(q: EventQuery): unknown[] {
  const conditions: string[] = []
  const params: (string | number)[] = []

  if (q.bead_id) {
    conditions.push("bead_id = ?")
    params.push(q.bead_id)
  }
  if (q.goal_id) {
    conditions.push("goal_id = ?")
    params.push(q.goal_id)
  }
  if (q.queue_item_id) {
    conditions.push("queue_item_id = ?")
    params.push(q.queue_item_id)
  }
  if (q.project) {
    conditions.push("project = ?")
    params.push(q.project)
  }
  if (q.since) {
    conditions.push("ts >= ?")
    params.push(q.since)
  }

  if (q.type) {
    const types = q.type
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
    conditions.push(`type IN (${types.map(() => "?").join(", ")})`)
    params.push(...types)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
  const limit = Math.min(q.limit ?? 500, 5000)
  const offset = q.offset ?? 0

  params.push(limit, offset)

  return db
    .query(
      `SELECT id, ts, goal_id, bead_id, queue_item_id, project, type, content, meta, inserted_at
     FROM events ${where}
     ORDER BY inserted_at ASC, id ASC
     LIMIT ? OFFSET ?`
    )
    .all(...params)
}

export interface UsageSummary {
  project: string
  bead_count: number
  total_cost_usd: number | null
  total_input_tokens: number | null
  total_output_tokens: number | null
  total_cached_tokens: number | null
}

export function queryUsageSummary(since?: string): UsageSummary[] {
  const where = since ? "WHERE type = 'usage' AND ts >= ?" : "WHERE type = 'usage'"
  const params = since ? [since] : []

  return db
    .query<UsageSummary, (string | number)[]>(
      `SELECT
       project,
       COUNT(DISTINCT bead_id)                                            AS bead_count,
       SUM(CAST(json_extract(meta, '$.cost') AS REAL))                    AS total_cost_usd,
       SUM(CAST(json_extract(meta, '$.usage.input_tokens') AS INTEGER))   AS total_input_tokens,
       SUM(CAST(json_extract(meta, '$.usage.output_tokens') AS INTEGER))  AS total_output_tokens,
       SUM(CAST(json_extract(meta, '$.usage.cache_read_input_tokens') AS INTEGER)) AS total_cached_tokens
     FROM events ${where}
     GROUP BY project
     ORDER BY total_cost_usd DESC`
    )
    .all(...params)
}

// ── SQL playground ───────────────────────────────────────────────────────────

const MAX_QUERY_ROWS = 2000

// Two checks: must start with a safe keyword; must not contain a write keyword.
// The readonly connection is the hard safety net — this is belt-and-suspenders.
const SAFE_START = /^\s*(SELECT|WITH|EXPLAIN|PRAGMA)\b/i
const WRITE_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|ATTACH|DETACH|REPLACE|TRUNCATE|VACUUM|REINDEX)\b/i

export interface QueryResult {
  columns: string[]
  rows: (string | number | bigint | boolean | null)[][]
  rowCount: number
  truncated: boolean
}

export type QueryError = { error: string }

export function executeQuery(sql: string): QueryResult | QueryError {
  const trimmed = sql.trim()
  if (!trimmed) return { error: "Empty query" }
  if (!SAFE_START.test(trimmed)) return { error: "Only SELECT, WITH, EXPLAIN, and PRAGMA statements are allowed" }
  if (WRITE_KEYWORDS.test(trimmed)) return { error: "Write operations are not permitted in the query playground" }

  try {
    const stmt = readonlyDb.prepare(trimmed)
    const raw = stmt.all() as Record<string, unknown>[]
    const columns = raw.length > 0 ? Object.keys(raw[0]!) : []
    const truncated = raw.length > MAX_QUERY_ROWS
    const rows = raw
      .slice(0, MAX_QUERY_ROWS)
      .map((row) => columns.map((col) => row[col] as string | number | bigint | boolean | null))

    return { columns, rows, rowCount: raw.length, truncated }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Query failed" }
  }
}
