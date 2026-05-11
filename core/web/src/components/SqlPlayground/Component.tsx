import { memo, useState, useCallback } from "react"
import { pipeline } from "@/utils/pipeline"
import { useSqlQuery } from "@/hooks/useSqlQuery"
import { SqlPlaygroundView } from "./View"

const DEFAULT_SQL = "SELECT * FROM events ORDER BY inserted_at DESC LIMIT 100"

function SqlPlaygroundComponent() {
  const [sql, setSql] = useState(DEFAULT_SQL)
  const { result, loading, error, run, clear } = useSqlQuery()

  const handleRun = useCallback(() => void run(sql), [run, sql])

  return (
    <SqlPlaygroundView
      sql={sql}
      result={result}
      loading={loading}
      error={error}
      onSqlChange={setSql}
      onRun={handleRun}
      onClear={clear}
    />
  )
}

export const SqlPlayground = pipeline(memo)(SqlPlaygroundComponent)
