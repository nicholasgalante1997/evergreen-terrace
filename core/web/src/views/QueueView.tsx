import React, { useState, useCallback } from "react"
import { useQueue } from "../hooks/useQueue"
import { SidebarRow } from "../components/QueueItem"
import { ItemDetail } from "../components/ItemDetail"
import { AgentFeed } from "../components/AgentFeed"
import type { QueueItem } from "@evergreen-terrace/common"

type Lane = "inbox" | "active" | "completed"

interface Selection {
  id: string
  lane: Lane
}

function sortByPriority(items: QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => a.item.priority.localeCompare(b.item.priority))
}

function QueueViewComponent() {
  const { inbox, active, completed, loading, error, refresh, dispatch, complete, returnToInbox } = useQueue(20_000)
  const [selection, setSelection] = useState<Selection | null>(null)

  const select = useCallback((id: string, lane: Lane) => {
    setSelection((prev) => (prev?.id === id ? null : { id, lane }))
  }, [])

  const selectedItem = selection
    ? ([...inbox, ...active, ...completed].find((i) => i.item.id === selection.id) ?? null)
    : null

  // Show agent feed for active + completed items that may have a bead
  const showFeed = selection && (selection.lane === "active" || selection.lane === "completed")

  return (
    <div className={`queue-layout ${showFeed ? "queue-layout--three" : ""}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        {loading && (
          <p
            className="status-loading"
            style={{ padding: "12px" }}
          >
            loading…
          </p>
        )}
        {error && (
          <p
            className="status-error"
            style={{ padding: "12px", fontSize: 11 }}
          >
            queue-server unreachable
          </p>
        )}

        <div className="sidebar__section">
          <div className="sidebar__section-header">
            Inbox
            <span className="sidebar__count">({inbox.length})</span>
          </div>
          {inbox.length === 0 ? (
            <p className="sidebar__empty">empty</p>
          ) : (
            <ul className="sidebar__list sidebar__list--inbox">
              {sortByPriority(inbox).map((item) => (
                <SidebarRow
                  key={item.item.id}
                  item={item}
                  selected={selection?.id === item.item.id}
                  onClick={() => select(item.item.id, "inbox")}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="sidebar__section">
          <div className="sidebar__section-header">
            Active
            <span className="sidebar__count">({active.length})</span>
          </div>
          {active.length === 0 ? (
            <p className="sidebar__empty">empty</p>
          ) : (
            <ul className="sidebar__list sidebar__list--active">
              {sortByPriority(active).map((item) => (
                <SidebarRow
                  key={item.item.id}
                  item={item}
                  selected={selection?.id === item.item.id}
                  onClick={() => select(item.item.id, "active")}
                />
              ))}
            </ul>
          )}
        </div>

        {completed.length > 0 && (
          <div className="sidebar__section">
            <div className="sidebar__section-header">
              Completed
              <span className="sidebar__count">({completed.length})</span>
            </div>
            <ul className="sidebar__list">
              {sortByPriority(completed).map((item) => (
                <SidebarRow
                  key={item.item.id}
                  item={item}
                  selected={selection?.id === item.item.id}
                  onClick={() => select(item.item.id, "completed")}
                />
              ))}
            </ul>
          </div>
        )}
      </aside>

      {/* Detail panel */}
      {selectedItem && selection ? (
        <ItemDetail
          item={selectedItem}
          lane={selection.lane}
          onDispatch={dispatch}
          onComplete={complete}
          onReturn={returnToInbox}
        />
      ) : (
        <div className="detail">
          <div className="detail__empty">{loading ? "" : "Select an item to inspect"}</div>
          {!loading && (
            <div className="action-bar">
              <div className="action-spacer" />
              <button
                className="btn"
                onClick={() => void refresh()}
              >
                Refresh
              </button>
            </div>
          )}
        </div>
      )}

      {/* Agent feed — only shown for active/completed items */}
      {showFeed && (
        <AgentFeed
          queueItemId={selection.id}
          onApproved={() => void refresh()}
          onRejected={() => void refresh()}
        />
      )}
    </div>
  )
}

export const QueueView = React.memo(QueueViewComponent)
