import { useEffect, useRef, useState, useCallback, memo } from "react"
import { pipeline } from "@/utils/pipeline"
import { useAgentFeed } from "@/hooks/useAgentFeed"
import { AgentFeedView } from "./View"
import type { AgentFeedProps } from "./types"

function AgentFeedComponent({ queueItemId, onApproved, onRejected }: AgentFeedProps) {
  const { bead, events, streaming, error, promptData, promptLoading, dispatch, approve, reject, retry } =
    useAgentFeed(queueItemId)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events, autoScroll])

  const handleApprove = useCallback(async () => {
    setActionBusy(true)
    const ok = await approve()
    setActionBusy(false)
    if (ok) {
      setActionFeedback("Approved — item marked complete.")
      onApproved?.()
    } else {
      setActionFeedback("Approve failed.")
    }
  }, [approve, onApproved])

  const handleReject = useCallback(async () => {
    setActionBusy(true)
    const ok = await reject()
    setActionBusy(false)
    if (ok) {
      setActionFeedback("Rejected — bead marked failed.")
      onRejected?.()
    } else {
      setActionFeedback("Reject failed.")
    }
  }, [reject, onRejected])

  const handleRetry = useCallback(async () => {
    setActionBusy(true)
    setActionFeedback(null)
    const ok = await retry()
    setActionBusy(false)
    if (!ok) setActionFeedback("Retry failed.")
  }, [retry])

  return (
    <AgentFeedView
      queueItemId={queueItemId}
      bead={bead}
      events={events}
      streaming={streaming}
      error={error}
      promptData={promptData}
      promptLoading={promptLoading}
      autoScroll={autoScroll}
      actionBusy={actionBusy}
      actionFeedback={actionFeedback}
      scrollRef={scrollRef}
      onAutoScrollChange={setAutoScroll}
      onDispatch={dispatch}
      onApprove={() => void handleApprove()}
      onReject={() => void handleReject()}
      onRetry={() => void handleRetry()}
      onScrollToBottom={() => {
        setAutoScroll(true)
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }}
    />
  )
}

export const AgentFeed = pipeline(memo)(AgentFeedComponent)
