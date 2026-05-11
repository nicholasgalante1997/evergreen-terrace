import { AcceptanceCriteria } from "./AcceptanceCriteria"
import type { ItemDetailViewProps } from "./types"

const AGENTS = [
  "pm",
  "eng-senior",
  "eng-mid",
  "eng-junior",
  "voice",
  "stakeholder",
  "director",
  "momentum-sentinel"
] as const

export function ItemDetailView({
  item,
  lane,
  selectedAgent,
  busy,
  feedback,
  onAgentChange,
  onDispatch,
  onComplete,
  onReturn
}: ItemDetailViewProps) {
  const p = item.item.priority
  return (
    <div className="detail">
      <div className="detail__scroll">
        <div className="detail__header">
          <h2 className="detail__title">{item.item.title}</h2>
          <div className="detail__badges">
            <span className={`badge badge--${p}`}>{p}</span>
            <span className="badge">{item.item.type}</span>
            <span className="badge">{item.item.project}</span>
            {item.delegation.agent && <span className="badge badge--agent">{item.delegation.agent}</span>}
          </div>
        </div>

        <div className="detail__meta">
          <div className="detail__meta-item">
            <span className="detail__meta-label">Created</span>
            <span className="detail__meta-value">{item.item.created.slice(0, 10)}</span>
          </div>
          <div className="detail__meta-item">
            <span className="detail__meta-label">Source</span>
            <span className="detail__meta-value">{item.item.source}</span>
          </div>
          {item.delegation.delegated_at && (
            <div className="detail__meta-item">
              <span className="detail__meta-label">Dispatched</span>
              <span className="detail__meta-value">{item.delegation.delegated_at.slice(0, 16).replace("T", " ")}</span>
            </div>
          )}
          <div className="detail__meta-item">
            <span className="detail__meta-label">ID</span>
            <span
              className="detail__meta-value"
              style={{ fontFamily: "monospace", fontSize: 10 }}
            >
              {item.item.id.slice(0, 8)}
            </span>
          </div>
        </div>

        {item.context.description.trim() && (
          <div className="content-section">
            <div className="content-section__label">Description</div>
            <div className="content-section__body">{item.context.description.trim()}</div>
          </div>
        )}

        {item.context.acceptance.trim() && (
          <div className="content-section">
            <div className="content-section__label">Acceptance Criteria</div>
            <div className="content-section__acceptance">
              <AcceptanceCriteria text={item.context.acceptance.trim()} />
            </div>
          </div>
        )}

        {item.context.links.length > 0 && (
          <div className="content-section">
            <div className="content-section__label">Links</div>
            <ul className="links-list">
              {item.context.links.map((link, i) => (
                <li
                  key={i}
                  className="links-list__item"
                >
                  {link}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="action-bar">
        {lane === "inbox" && (
          <>
            <span className="action-bar__label">Agent</span>
            <select
              className="agent-select"
              value={selectedAgent}
              onChange={(e) => onAgentChange(e.target.value)}
            >
              {AGENTS.map((a) => (
                <option
                  key={a}
                  value={a}
                >
                  {a}
                </option>
              ))}
            </select>
            <button
              className="btn btn--primary"
              onClick={onDispatch}
              disabled={busy}
            >
              {busy ? "Dispatching…" : "Dispatch →"}
            </button>
          </>
        )}
        {lane === "active" && (
          <>
            <button
              className="btn btn--success"
              onClick={onComplete}
              disabled={busy}
            >
              ✓ Mark Complete
            </button>
            <button
              className="btn btn--danger"
              onClick={onReturn}
              disabled={busy}
            >
              ↩ Return to Inbox
            </button>
          </>
        )}
        {lane === "completed" && (
          <span
            className="action-bar__label"
            style={{ color: "var(--p2)" }}
          >
            ✓ Completed
          </span>
        )}
        <div className="action-spacer" />
        {feedback && (
          <span className={`action-feedback ${feedback.ok ? "action-feedback--ok" : "action-feedback--err"}`}>
            {feedback.msg}
          </span>
        )}
      </div>
    </div>
  )
}
