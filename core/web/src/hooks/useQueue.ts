import { useState, useEffect, useCallback } from "react"
import type { QueueState } from "@evergreen-terrace/common"

export interface UseQueueResult extends QueueState {
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  dispatch: (id: string, agent: string) => Promise<boolean>
  complete: (id: string) => Promise<boolean>
  returnToInbox: (id: string) => Promise<boolean>
}

export function useQueue(pollMs = 0): UseQueueResult {
  const [state, setState] = useState<QueueState>({ inbox: [], active: [], completed: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/queue")
      if (!res.ok) throw new Error(`${res.status}`)
      setState((await res.json()) as QueueState)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "queue-server unreachable")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    if (pollMs > 0) {
      const id = setInterval(() => void refresh(), pollMs)
      return () => clearInterval(id)
    }
  }, [refresh, pollMs])

  const dispatch = useCallback(
    async (id: string, agent: string): Promise<boolean> => {
      try {
        const res = await fetch("/queue/delegate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, agent })
        })
        if (!res.ok) return false
        await refresh()
        return true
      } catch {
        return false
      }
    },
    [refresh]
  )

  const complete = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await fetch("/queue/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id })
        })
        if (!res.ok) return false
        await refresh()
        return true
      } catch {
        return false
      }
    },
    [refresh]
  )

  const returnToInbox = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await fetch("/queue/return", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id })
        })
        if (!res.ok) return false
        await refresh()
        return true
      } catch {
        return false
      }
    },
    [refresh]
  )

  return { ...state, loading, error, refresh, dispatch, complete, returnToInbox }
}
