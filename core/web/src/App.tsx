import React, { useState } from "react";
import { QueueView } from "./views/QueueView";
import { MetricsView } from "./views/MetricsView";

type Tab = "queue" | "metrics";

function AppComponent() {
  const [tab, setTab] = useState<Tab>("queue");

  return (
    <main className="layout">
      <header className="header">
        <h1>evergreen-terrace</h1>
        <nav className="tab-nav">
          <button
            className={`tab-btn ${tab === "queue" ? "tab-active" : ""}`}
            onClick={() => setTab("queue")}
          >
            Queue
          </button>
          <button
            className={`tab-btn ${tab === "metrics" ? "tab-active" : ""}`}
            onClick={() => setTab("metrics")}
          >
            Metrics
          </button>
        </nav>
      </header>

      {tab === "queue" ? <QueueView /> : <MetricsView />}
    </main>
  );
}

export const App = React.memo(AppComponent);
