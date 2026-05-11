import { useState, useCallback, useEffect } from "react"

export interface DbEvent {
  id: number
  ts: string
  goal_id: string
  bead_id: string
  queue_item_id: string
  project: string
  type: string
  content: string
  meta: Record<string, unknown> | null
  inserted_at: number
}

export interface UsageSummary {
  project: string
  bead_count: number
  total_cost_usd: number | null
  total_input_tokens: number | null
  total_output_tokens: number | null
  total_cached_tokens: number | null
}

export interface EventHistoryQuery {
  beadId?: string
  goalId?: string
  queueItemId?: string
  project?: string
  types?: string[]
  since?: string
  limit?: number
}

export interface UseEventHistoryResult {
  events: DbEvent[]
  usage: UsageSummary[]
  loading: boolean
  usageLoading: boolean
  error: string | null
  fetch: (q: EventHistoryQuery) => Promise<void>
  clear: () => void
}

export function useEventHistory(): UseEventHistoryResult {
  const [events, setEvents] = useState<DbEvent[]>([])
  const [usage, setUsage] = useState<UsageSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [usageLoading, setUsageLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setUsageLoading(true)
    void fetch("/conductor/usage")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("usage unavailable"))))
      .then((data) => setUsage(data as UsageSummary[]))
      .catch(() => setUsage([]))
      .finally(() => setUsageLoading(false))
  }, [])

  const fetchEvents = useCallback(async (q: EventHistoryQuery) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q.beadId) params.set("bead_id", q.beadId)
      if (q.goalId) params.set("goal_id", q.goalId)
      if (q.queueItemId) params.set("queue_item_id", q.queueItemId)
      if (q.project) params.set("project", q.project)
      if (q.types?.length) params.set("type", q.types.join(","))
      if (q.since) params.set("since", q.since)
      if (q.limit) params.set("limit", String(q.limit))

      const res = await fetch(`/conductor/events?${params.toString()}`)
      if (!res.ok) throw new Error(`conductor returned ${res.status}`)

      const data = (await res.json()) as { events: Array<DbEvent & { meta: string | null }> }
      setEvents(
        data.events.map((e) => ({
          ...e,
          meta: e.meta ? (JSON.parse(e.meta) as Record<string, unknown>) : null
        }))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "query failed")
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => setEvents([]), [])

  return { events, usage, loading, usageLoading, error, fetch: fetchEvents, clear }
}
