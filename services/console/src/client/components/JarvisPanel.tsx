/** @module Jarvis panel: explicit questions in, cited answers out, proposals run only on a click. */

import { useState } from "react"
import { askJarvis, invokeAction } from "../api"
import type { JarvisOutcome } from "../api"

export const JarvisPanel = ({ goalId, goalTitle }: { goalId: string | null; goalTitle: string | null }) => {
  const [question, setQuestion] = useState("")
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<JarvisOutcome | null>(null)
  const [actionResult, setActionResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ask = async (text: string) => {
    setBusy(true)
    setError(null)
    setActionResult(null)
    try {
      setOutcome(await askJarvis(text, goalId))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  const run = async (tool: string, argumentsValue: Record<string, unknown>) => {
    setError(null)
    try {
      setActionResult(JSON.stringify(await invokeAction(tool, argumentsValue), null, 2))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  return (
    <section className="panel jarvis">
      <h3>Jarvis {goalTitle === null ? "· whole factory" : `· ${goalTitle}`}</h3>
      <p className="muted">Read-only. Answers cite read-model records; proposed actions run only when you click them.</p>
      <div className="option-row">
        {goalId === null ? (
          <button
            disabled={busy}
            onClick={() => void ask("What needs my attention right now, and why?")}
            type="button"
          >
            What needs my attention?
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={() => void ask("Explain this goal's current state, what is blocking it, and the next step.")}
            type="button"
          >
            Explain this goal
          </button>
        )}
      </div>
      <textarea
        aria-label="Ask Jarvis"
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="Ask about factory state"
        value={question}
      />
      <button
        disabled={busy || question.trim().length === 0}
        onClick={() => void ask(question)}
        type="button"
      >
        {busy ? "Jarvis is reading the evidence…" : "Ask"}
      </button>
      {error === null ? null : <p className="error">{error}</p>}
      {outcome === null ? null : outcome.status === "failed" ? (
        <p className="error">Jarvis could not answer: {outcome.detail}</p>
      ) : (
        <div className="jarvis-answer">
          <pre className="context">{outcome.answer.answer}</pre>
          <h4>Claims</h4>
          <ul>
            {outcome.answer.claims.map((claim) => (
              <li key={claim.statement}>
                {claim.statement} <span className="badge">{claim.confidence}</span>{" "}
                <span className="muted mono">
                  {claim.sources.map((source) => `${source.kind}:${source.id.slice(0, 8)}`).join(", ")}
                </span>
              </li>
            ))}
          </ul>
          {outcome.answer.missingEvidence.length === 0 ? null : (
            <>
              <h4>Missing evidence</h4>
              <ul>
                {outcome.answer.missingEvidence.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </>
          )}
          {outcome.answer.proposedActions.length === 0 ? null : (
            <>
              <h4>Proposed actions</h4>
              {outcome.answer.proposedActions.map((action) => (
                <div
                  className="proposal"
                  key={action.label}
                >
                  <button
                    onClick={() => void run(action.tool, action.arguments)}
                    type="button"
                  >
                    {action.label}
                  </button>{" "}
                  <span className="muted mono">{action.tool}</span> — {action.consequence}
                </div>
              ))}
            </>
          )}
          <p className="muted mono">question {outcome.questionId}</p>
        </div>
      )}
      {actionResult === null ? null : <pre className="context">{actionResult}</pre>}
    </section>
  )
}
