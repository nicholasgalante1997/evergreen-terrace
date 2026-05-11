import React from "react"
import { useSentinel } from "../hooks/useSentinel"

function SentinelViewComponent() {
  const { report, status, loading, running, error, triggerRun, refresh } = useSentinel()

  const lastRun = status?.last_run ? status.last_run.slice(0, 16).replace("T", " ") : "never"

  return (
    <div className="sentinel-layout">
      {/* Toolbar */}
      <div className="sentinel-toolbar">
        <span className="sentinel-toolbar__stat">
          mode: <span>{status?.mode ?? "—"}</span>
        </span>
        <span className="sentinel-toolbar__sep">·</span>
        <span className="sentinel-toolbar__stat">
          last run: <span>{lastRun}</span>
        </span>
        {status?.next_run && (
          <>
            <span className="sentinel-toolbar__sep">·</span>
            <span className="sentinel-toolbar__stat">
              next: <span>{status.next_run.slice(0, 16).replace("T", " ")}</span>
            </span>
          </>
        )}

        <div style={{ flex: 1 }} />

        {running && <span className="sentinel-running">Running sentinel…</span>}

        <button
          className="btn btn--primary"
          onClick={() => void triggerRun()}
          disabled={running || loading}
        >
          {running ? "Running…" : "Run Now"}
        </button>

        <button
          className="btn"
          onClick={() => void refresh()}
          disabled={running}
        >
          Refresh
        </button>
      </div>

      {/* Report body */}
      <div className="sentinel-report">
        {loading && <p className="status-loading">loading…</p>}
        {error && <p className="status-error">{error}</p>}

        {!loading && !error && !report && (
          <p className="sentinel-report__empty">No report on disk. Click "Run Now" to generate one.</p>
        )}

        {!loading && report && <pre className="sentinel-report__content">{report}</pre>}
      </div>
    </div>
  )
}

export const SentinelView = React.memo(SentinelViewComponent)
