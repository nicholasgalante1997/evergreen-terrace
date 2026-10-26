/** @module One decision card: the full context, its options, and an explicit one-option resolution. */

import { useState } from "react"
import type { ConsoleDecision } from "../../read-model/read-model.types"
import { resolveDecision } from "../api"

export const DecisionCard = ({ decision, onResolved }: { decision: ConsoleDecision; onResolved: () => void }) => {
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resolve = async (selectedOptionId: string | null, status: "approved" | "rejected") => {
    setBusy(true)
    setError(null)
    try {
      await resolveDecision(decision.id, { note, selectedOptionId, status })
      onResolved()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }
  return (
    <article className={`card decision ${decision.status}`}>
      <header>
        <span className="badge">{decision.category}</span>
        <h3>{decision.title}</h3>
        <span className="muted mono">{decision.id.slice(0, 8)}</span>
      </header>
      <details open={decision.status === "requested"}>
        <summary>Context</summary>
        <pre className="context">{decision.context}</pre>
      </details>
      {decision.status === "requested" ? (
        <div className="decision-actions">
          <textarea
            aria-label="Resolution note"
            onChange={(event) => setNote(event.target.value)}
            placeholder="Note (recorded with the resolution; a revision request goes to the mayor verbatim)"
            value={note}
          />
          <div className="option-row">
            {decision.options.map((option) => (
              <button
                className={option.id === decision.recommended_option_id ? "primary" : ""}
                disabled={busy}
                key={option.id}
                onClick={() => void resolve(option.id, "approved")}
                title={option.detail}
                type="button"
              >
                {option.label}
              </button>
            ))}
            <button
              className="danger"
              disabled={busy}
              onClick={() => void resolve(null, "rejected")}
              type="button"
            >
              Reject card
            </button>
          </div>
          {error === null ? null : <p className="error">{error}</p>}
        </div>
      ) : (
        <p className="muted">
          {decision.status}
          {decision.resolution?.selectedOptionId ? ` · ${decision.resolution.selectedOptionId}` : ""}
          {decision.resolution?.note ? ` · ${decision.resolution.note}` : ""}
        </p>
      )}
    </article>
  )
}
