import type { QueryResult } from "@/hooks/useSqlQuery"
export type { QueryResult }

export interface SqlPlaygroundViewProps {
  sql: string
  result: QueryResult | null
  loading: boolean
  error: string | null
  onSqlChange: (sql: string) => void
  onRun: () => void
  onClear: () => void
}

export const EXAMPLE_QUERIES = [
  {
    label: "Recent events",
    sql: "SELECT ts, project, bead_id, type, content\nFROM events\nORDER BY inserted_at DESC\nLIMIT 100"
  },
  {
    label: "Events by type",
    sql: "SELECT type, COUNT(*) AS count\nFROM events\nGROUP BY type\nORDER BY count DESC"
  },
  {
    label: "Cost by project",
    sql: "SELECT\n  project,\n  COUNT(DISTINCT bead_id) AS beads,\n  ROUND(SUM(json_extract(meta, '$.cost')), 6) AS total_cost_usd,\n  SUM(json_extract(meta, '$.usage.input_tokens')) AS input_tokens,\n  SUM(json_extract(meta, '$.usage.output_tokens')) AS output_tokens\nFROM events\nWHERE type = 'usage'\nGROUP BY project\nORDER BY total_cost_usd DESC"
  },
  {
    label: "Tool call frequency",
    sql: "SELECT\n  json_extract(meta, '$.tool') AS tool,\n  COUNT(*) AS calls\nFROM events\nWHERE type = 'tool_use'\nGROUP BY tool\nORDER BY calls DESC"
  },
  {
    label: "Bash commands run",
    sql: "SELECT ts, project, bead_id, content\nFROM events\nWHERE type = 'tool_use'\n  AND json_extract(meta, '$.tool') = 'Bash'\nORDER BY inserted_at DESC\nLIMIT 100"
  },
  {
    label: "All errors",
    sql: "SELECT ts, project, bead_id, content\nFROM events\nWHERE type = 'error'\nORDER BY inserted_at DESC"
  },
  {
    label: "Bead activity",
    sql: "SELECT\n  bead_id,\n  project,\n  MIN(ts) AS started,\n  MAX(ts) AS ended,\n  COUNT(*) AS events\nFROM events\nGROUP BY bead_id\nORDER BY started DESC\nLIMIT 50"
  }
] as const
