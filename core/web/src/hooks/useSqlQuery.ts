import { useState, useCallback } from "react"

export interface QueryResult {
  columns: string[]
  rows: (string | number | bigint | boolean | null)[][]
  rowCount: number
  truncated: boolean
}

export interface UseSqlQueryResult {
  result: QueryResult | null
  loading: boolean
  error: string | null
  run: (sql: string) => Promise<void>
  clear: () => void
}

export function useSqlQuery(): UseSqlQueryResult {
  const [result, setResult] = useState<QueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (sql: string) => {
    if (!sql.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/conductor/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql })
      })
      const data = (await res.json()) as QueryResult | { error: string }
      if ("error" in data) {
        setError(data.error)
        setResult(null)
      } else {
        setResult(data)
        setError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return { result, loading, error, run, clear }
}
