import { useState, useCallback } from "react"
import type { PromptPanelViewProps } from "./types"

const STATUS_CLASS: Record<string, string> = {
  prompt_pending: "feed-status--prompt"
}

const STATUS_LABEL: Record<string, string> = {
  prompt_pending: "Building Prompt"
}

export function PromptPanel({ bead, promptData, promptLoading, onDispatch }: PromptPanelViewProps) {
  const [editedPrompt, setEditedPrompt] = useState(promptData.prompt)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleDispatch = useCallback(
    async (useEdit: boolean) => {
      setBusy(true)
      setFeedback(null)
      const ok = await onDispatch(useEdit ? editedPrompt : undefined)
      setBusy(false)
      if (!ok) setFeedback("Dispatch failed — is the conductor running?")
    },
    [editedPrompt, onDispatch]
  )

  if (promptLoading) {
    return (
      <div className="feed feed--empty">
        <span className="feed__empty-msg feed__pulse-text">Building prompt…</span>
        <span className="feed__empty-sub">
          {bead.bead.role} · {bead.worker.cwd.split("/").slice(-2).join("/")}
        </span>
      </div>
    )
  }

  const edited = editedPrompt !== promptData.prompt

  return (
    <div className="feed feed--prompt-review">
      <div className="feed__header">
        <div className="feed__header-left">
          <span className="feed__role">{bead.bead.role}</span>
          <span className={`feed__status ${STATUS_CLASS["prompt_pending"]}`}>
            <span className="feed__pulse" />
            {STATUS_LABEL["prompt_pending"]}
          </span>
        </div>
        <div className="feed__header-right">
          <span
            className="feed__cwd"
            title={bead.worker.cwd}
          >
            {bead.worker.cwd.split("/").slice(-2).join("/")}
          </span>
        </div>
      </div>

      <div className="feed__prompt-body">
        <div className="feed__prompt-section">
          <div className="feed__prompt-label">
            System Prompt
            <span className="feed__prompt-meta">read-only · assembled from agent role + skills + steering</span>
          </div>
          <details className="feed__sysprompt-details">
            <summary className="feed__sysprompt-summary">
              {promptData.systemPrompt.length.toLocaleString()} chars — click to expand
            </summary>
            <pre className="feed__sysprompt-pre">{promptData.systemPrompt}</pre>
          </details>
        </div>

        <div className="feed__prompt-section">
          <div className="feed__prompt-label">
            User Prompt
            <span className="feed__prompt-meta">editable · sent via -p flag</span>
          </div>
          <textarea
            className="feed__prompt-textarea"
            value={editedPrompt}
            onChange={(e) => setEditedPrompt(e.target.value)}
            spellCheck={false}
          />
          <div className="feed__prompt-char-count">
            {editedPrompt.length.toLocaleString()} chars
            {edited && <span className="feed__prompt-edited"> · edited</span>}
          </div>
        </div>

        <div className="feed__prompt-actions">
          <button
            className="btn btn--success"
            onClick={() => void handleDispatch(edited)}
            disabled={busy || editedPrompt.trim().length === 0}
          >
            {edited ? "Dispatch with Edits" : "Dispatch"}
          </button>
          {edited && (
            <button
              className="btn btn--secondary"
              onClick={() => setEditedPrompt(promptData.prompt)}
              disabled={busy}
            >
              Reset
            </button>
          )}
        </div>

        {feedback && <div className="feed__prompt-feedback feed__prompt-feedback--err">{feedback}</div>}
      </div>
    </div>
  )
}
