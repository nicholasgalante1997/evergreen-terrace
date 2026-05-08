import React from "react";
import { useMetrics } from "../hooks/useMetrics";
import { VelocityChart } from "../components/VelocityChart";
import { HealthSparkline } from "../components/HealthSparkline";
import { AgeDistribution } from "../components/AgeDistribution";

function MetricsViewComponent() {
  const { velocity, sentinelHistory, queueMetrics, loading, error } = useMetrics(60_000);

  if (loading) return <p className="status-loading">loading...</p>;
  if (error) return <p className="status-error">metrics service unreachable</p>;

  return (
    <>
      <section className="section">
        <h2 className="section-header">Queue Velocity</h2>
        <VelocityChart data={velocity} />
      </section>

      <section className="section">
        <h2 className="section-header">Project Health</h2>
        {sentinelHistory.length === 0 ? (
          <p className="section-empty">no sentinel data</p>
        ) : (
          sentinelHistory.map((h) => (
            <HealthSparkline key={h.project} history={h} />
          ))
        )}
      </section>

      <section className="section">
        <h2 className="section-header">Work Item Age Distribution</h2>
        <AgeDistribution data={queueMetrics} />
      </section>
    </>
  );
}

export const MetricsView = React.memo(MetricsViewComponent);
