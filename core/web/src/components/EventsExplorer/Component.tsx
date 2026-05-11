import { memo, useState, useCallback } from "react"
import { pipeline } from "@/utils/pipeline"
import { useEventHistory } from "@/hooks/useEventHistory"
import { EventsExplorerView } from "./View"
import type { FilterState, EventType } from "./types"
import { EVENT_TYPES } from "./types"

const DEFAULT_FILTER: FilterState = {
  project: "",
  beadId: "",
  queueItemId: "",
  since: "",
  limit: 500,
  types: new Set(EVENT_TYPES)
}

function EventsExplorerComponent() {
  const { events, usage, loading, usageLoading, error, fetch, clear } = useEventHistory()
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER)

  const handleFilterChange = useCallback((patch: Partial<FilterState>) => {
    setFilter((prev) => ({ ...prev, ...patch }))
  }, [])

  const handleTypeToggle = useCallback((type: EventType) => {
    setFilter((prev) => {
      const next = new Set(prev.types)
      next.has(type) ? next.delete(type) : next.add(type)
      return { ...prev, types: next }
    })
  }, [])

  const handleQuery = useCallback(() => {
    void fetch({
      project: filter.project || undefined,
      beadId: filter.beadId || undefined,
      queueItemId: filter.queueItemId || undefined,
      since: filter.since || undefined,
      limit: filter.limit,
      types: filter.types.size === EVENT_TYPES.length ? undefined : [...filter.types]
    })
  }, [fetch, filter])

  return (
    <EventsExplorerView
      events={events}
      usage={usage}
      loading={loading}
      usageLoading={usageLoading}
      error={error}
      filter={filter}
      onFilterChange={handleFilterChange}
      onTypeToggle={handleTypeToggle}
      onQuery={handleQuery}
      onClear={clear}
    />
  )
}

export const EventsExplorer = pipeline(memo)(EventsExplorerComponent)
