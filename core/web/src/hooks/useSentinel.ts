import { useState, useEffect, useCallback } from "react"

export interface SentinelStatus {
  last_run: string
  mode: string
  next_run: string | null
  run_in_progress: boolean
}

export interface UseSentinelResult {
  report: string | null
  status: SentinelStatus | null
  loading: boolean
  running: boolean
  error: string | null
  triggerRun: () => Promise<void>
  refresh: () => Promise<void>
}

export function useSentinel(): UseSentinelResult {
  const [report, setReport] = useState<string | null>(null)
  const [status, setStatus] = useState<SentinelStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/sentinel/status")
      if (res.ok) setStatus((await res.json()) as SentinelStatus)
    } catch {
      // sentinel server may not be running; not fatal
    }
  }, [])

  const fetchReport = useCallback(async () => {
    try {
      const res = await fetch("/sentinel/latest")
      if (res.ok) {
        setReport(await res.text())
        setError(null)
      } else if (res.status === 404) {
        setReport(null)
        setError(null)
      }
    } catch {
      setError("sentinel server unreachable — run: bun run sentinel")
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchReport(), fetchStatus()])
    setLoading(false)
  }, [fetchReport, fetchStatus])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const triggerRun = useCallback(async () => {
    if (running) return
    setRunning(true)
    setError(null)
    try {
      const res = await fetch("/sentinel/run", { method: "POST" })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setError(body.error ?? "run failed")
      } else {
        await refresh()
      }
    } catch {
      setError("sentinel server unreachable")
    } finally {
      setRunning(false)
    }
  }, [running, refresh])

  return { report, status, loading, running, error, triggerRun, refresh }
}
