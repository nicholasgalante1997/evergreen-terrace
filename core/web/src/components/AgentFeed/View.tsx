import { EventRow } from "./EventRow"
import { PromptPanel } from "./PromptPanel"
import type { AgentFeedViewProps } from "./types"

const STATUS_LABEL: Record<string, string> = {
  pending: "Queued",
  prompt_pending: "Building Prompt",
  in_progress: "Running",
  review_pending: "Awaiting Review",
  completed: "Completed",
  failed: "Failed"
}

const STATUS_CLASS: Record<string, string> = {
  pending: "feed-status--pending",
  prompt_pending: "feed-status--prompt",
  in_progress: "feed-status--running",
  review_pending: "feed-status--review",
  completed: "feed-status--done",
  failed: "feed-status--failed"
}

export function AgentFeedView({
  queueItemId,
  bead,
  events,
  streaming,
  error,
  promptData,
  promptLoading,
  autoScroll,
  actionBusy,
  actionFeedback,
  scrollRef,
  onAutoScrollChange,
  onDispatch,
  onApprove,
  onReject,
  onRetry,
  onScrollToBottom
}: AgentFeedViewProps) {
  if (!queueItemId) {
    return (
      <div className="feed feed--empty">
        <span className="feed__empty-msg">Select an item to see agent activity</span>
      </div>
    )
  }

  if (!bead && !error) {
    return (
      <div className="feed feed--empty">
        <span className="feed__empty-msg">No conductor session</span>
        <span className="feed__empty-sub">Start the conductor or re-dispatch this item</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="feed feed--empty">
        <span className="feed__empty-msg feed__empty-msg--err">{error}</span>
      </div>
    )
  }

  if (bead!.bead.status === "prompt_pending") {
    if (!promptData) {
      return (
        <div className="feed feed--empty">
          <span className="feed__empty-msg feed__pulse-text">Building prompt…</span>
          <span className="feed__empty-sub">{bead!.bead.role} · assembling system prompt</span>
        </div>
      )
    }
    return (
      <PromptPanel
        bead={bead!}
        promptData={promptData}
        promptLoading={promptLoading}
        onDispatch={onDispatch}
      />
    )
  }

  const status = bead!.bead.status
  const statusLabel = STATUS_LABEL[status] ?? status
  const statusClass = STATUS_CLASS[status] ?? ""
  const usageEvent = events.findLast?.((e) => e.type === "usage") ?? null

  return (
    <div className="feed">
      <div className="feed__header">
        <div className="feed__header-left">
          <span className="feed__role">{bead!.bead.role}</span>
          <span className={`feed__status ${statusClass}`}>
            {streaming && <span className="feed__pulse" />}
            {statusLabel}
          </span>
        </div>
        <div className="feed__header-right">
          <span
            className="feed__cwd"
            title={bead!.worker.cwd}
          >
            {bead!.worker.cwd.split("/").slice(-2).join("/")}
          </span>
        </div>
      </div>

      <div
        className="feed__log"
        ref={scrollRef}
        onScroll={() => {
          if (!scrollRef.current) return
          const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
          onAutoScrollChange(scrollHeight - scrollTop - clientHeight < 40)
        }}
      >
        {events.length === 0 && streaming && <span className="feed__waiting">Starting agent…</span>}
        {events
          .filter((e) => e.type !== "usage")
          .map((ev, i) => (
            <EventRow
              key={i}
              ev={ev}
            />
          ))}
      </div>

      {usageEvent && (
        <div className="feed__usage-bar">
          <span className="feed__usage-icon">◈</span>
          <span className="feed__usage-content">{usageEvent.content}</span>
        </div>
      )}

      {!autoScroll && (
        <button
          className="feed__scroll-btn"
          onClick={onScrollToBottom}
        >
          ↓ scroll to bottom
        </button>
      )}

      {status === "review_pending" && (
        <div className="feed__review">
          <div className="feed__review-msg">
            Work complete — review the changes in the project repo before approving.
            <br />
            <span className="feed__review-cwd">{bead!.worker.cwd}</span>
          </div>
          <div className="feed__review-actions">
            <button
              className="btn btn--success"
              onClick={onApprove}
              disabled={actionBusy}
            >
              ✓ Approve &amp; Complete
            </button>
            <button
              className="btn btn--danger"
              onClick={onReject}
              disabled={actionBusy}
            >
              ✗ Reject
            </button>
          </div>
        </div>
      )}

      {status === "failed" && (
        <div className="feed__review">
          <div className="feed__review-msg feed__review-msg--err">
            Agent run failed. Check the output above for errors.
          </div>
          <div className="feed__review-actions">
            <button
              className="btn btn--primary"
              onClick={onRetry}
              disabled={actionBusy}
            >
              ↺ Retry
            </button>
          </div>
        </div>
      )}

      {actionFeedback && <div className="feed__feedback">{actionFeedback}</div>}
    </div>
  )
}
