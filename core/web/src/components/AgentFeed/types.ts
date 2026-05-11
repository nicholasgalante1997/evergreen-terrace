import type { RefObject } from "react"
import type { BeadInfo, BeadEvent, PromptData } from "@/hooks/useAgentFeed"

export interface AgentFeedProps {
  queueItemId: string | null
  onApproved?: () => void
  onRejected?: () => void
}

export interface AgentFeedViewProps {
  queueItemId: string | null
  bead: BeadInfo | null
  events: BeadEvent[]
  streaming: boolean
  error: string | null
  promptData: PromptData | null
  promptLoading: boolean
  autoScroll: boolean
  actionBusy: boolean
  actionFeedback: string | null
  scrollRef: RefObject<HTMLDivElement | null>
  onAutoScrollChange: (v: boolean) => void
  onDispatch: (promptOverride?: string) => Promise<boolean>
  onApprove: () => void
  onReject: () => void
  onRetry: () => void
  onScrollToBottom: () => void
}

export interface PromptPanelViewProps {
  bead: BeadInfo
  promptData: PromptData
  promptLoading: boolean
  onDispatch: (promptOverride?: string) => Promise<boolean>
}

export type { BeadInfo, BeadEvent, PromptData }
