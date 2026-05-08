import React from "react";
import { useQueue } from "../hooks/useQueue";
import { Section } from "../components/Section";

function QueueViewComponent() {
  const { inbox, active, loading, error, refresh } = useQueue(30_000);

  return (
    <>
      <nav className="view-actions">
        <button className="btn-refresh" onClick={() => void refresh()}>
          refresh
        </button>
      </nav>

      {loading && <p className="status-loading">loading...</p>}
      {error && (
        <p className="status-error">
          queue-server unreachable — run: bun run queue
        </p>
      )}

      {!loading && (
        <>
          <Section title="Inbox" items={inbox} />
          <Section title="Active" items={active} />
        </>
      )}
    </>
  );
}

export const QueueView = React.memo(QueueViewComponent);
