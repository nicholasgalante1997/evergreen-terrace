import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { AgeDistributionProps } from "./types";
import type { QueueMetric } from "../hooks/useMetrics";

function bucketAge(metrics: QueueMetric[]) {
  const buckets = [
    { name: "Same day", count: 0 },
    { name: "1–3 days", count: 0 },
    { name: "4–7 days", count: 0 },
    { name: "7+ days", count: 0 },
  ];

  for (const m of metrics) {
    if (!m.delegatedAt) continue;
    const days = (new Date(m.delegatedAt).getTime() - new Date(m.createdAt).getTime()) / 86_400_000;
    if (days < 1) buckets[0]!.count++;
    else if (days <= 3) buckets[1]!.count++;
    else if (days <= 7) buckets[2]!.count++;
    else buckets[3]!.count++;
  }

  return buckets;
}

function AgeDistributionComponent({ data }: AgeDistributionProps) {
  const buckets = useMemo(() => bucketAge(data), [data]);

  return (
    <figure className="chart-container">
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={buckets}>
          <XAxis dataKey="name" stroke="#4b5563" fontSize={10} />
          <YAxis stroke="#4b5563" fontSize={10} />
          <Tooltip contentStyle={{ background: "#1f2937", border: "none", fontSize: 12 }} />
          <Bar dataKey="count" fill="#6366f1" />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

export const AgeDistribution = React.memo(AgeDistributionComponent);
