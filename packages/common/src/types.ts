export type ItemPriority = "p0" | "p1" | "p2" | "p3"
export type ItemType = "feature" | "bug" | "research" | "design" | "pm" | "ops"
export type ItemSource = "manual" | "sentinel" | "jira" | "gitlab"

export interface QueueItem {
  item: {
    id: string
    title: string
    project: string
    type: ItemType
    priority: ItemPriority
    created: string
    source: ItemSource
  }
  delegation: {
    agent: string
    delegated_at: string
  }
  context: {
    description: string
    acceptance: string
    links: string[]
  }
}

export interface QueueState {
  inbox: QueueItem[]
  active: QueueItem[]
  completed: QueueItem[]
}

export type MetricEventType = "item_created" | "item_delegated" | "item_completed"

export interface MetricEvent {
  ts: string
  type: MetricEventType
  item_id: string
  project: string
  priority: string
  agent: string
}
