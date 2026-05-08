import React from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import type { HealthSparklineProps } from "./types";

function scoreClass(score: number): string {
  if (score >= 75) return "score-green";
  if (score >= 50) return "score-yellow";
  return "score-red";
}

function scoreColor(score: number): string {
  if (score >= 75) return "#22c55e";
  if (score >= 50) return "#eab308";
  return "#ef4444";
}

function HealthSparklineComponent({ history }: HealthSparklineProps) {
  const current = history.runs[history.runs.length - 1]?.score ?? 0;
  const color = scoreColor(current);

  return (
    <article className="sparkline-row">
      <span className="sparkline-label">{history.project}</span>
      <figure className="sparkline-chart">
        <ResponsiveContainer width="100%" height={24}>
          <LineChart data={history.runs}>
            <Line type="monotone" dataKey="score" stroke={color} dot={false} strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </figure>
      <span className={`sparkline-score ${scoreClass(current)}`}>{current}</span>
    </article>
  );
}

export const HealthSparkline = React.memo(HealthSparklineComponent);
