import type { DbEvent, UsageSummary, EventHistoryQuery } from "@/hooks/useEventHistory"
export type { DbEvent, UsageSummary, EventHistoryQuery }

export const EVENT_TYPES = ["output", "status", "error", "tool_use", "usage"] as const
export type EventType = (typeof EVENT_TYPES)[number]

export interface FilterState {
  project: string
  beadId: string
  queueItemId: string
  since: string
  limit: number
  types: Set<EventType>
}

export interface EventsExplorerViewProps {
  events: DbEvent[]
  usage: UsageSummary[]
  loading: boolean
  usageLoading: boolean
  error: string | null
  filter: FilterState
  onFilterChange: (patch: Partial<FilterState>) => void
  onTypeToggle: (type: EventType) => void
  onQuery: () => void
  onClear: () => void
}
