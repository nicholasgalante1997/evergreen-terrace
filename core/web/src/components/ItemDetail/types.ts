import type { QueueItem } from "@evergreen-terrace/common"

export type Lane = "inbox" | "active" | "completed"

export interface ItemDetailProps {
  item: QueueItem
  lane: Lane
  onDispatch: (id: string, agent: string) => Promise<boolean>
  onComplete: (id: string) => Promise<boolean>
  onReturn: (id: string) => Promise<boolean>
}

export interface ItemDetailViewProps {
  item: QueueItem
  lane: Lane
  selectedAgent: string
  busy: boolean
  feedback: { msg: string; ok: boolean } | null
  onAgentChange: (agent: string) => void
  onDispatch: () => void
  onComplete: () => void
  onReturn: () => void
}
