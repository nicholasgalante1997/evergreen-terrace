import React from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { VelocityChartProps } from "./types";

function VelocityChartComponent({ data }: VelocityChartProps) {
  return (
    <figure className="chart-container">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <XAxis dataKey="date" stroke="#4b5563" fontSize={10} />
          <YAxis stroke="#4b5563" fontSize={10} />
          <Tooltip contentStyle={{ background: "#1f2937", border: "none", fontSize: 12 }} />
          <Line type="monotone" dataKey="created" stroke="#3b82f6" dot={false} />
          <Line type="monotone" dataKey="delegated" stroke="#eab308" dot={false} />
          <Line type="monotone" dataKey="completed" stroke="#22c55e" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}

export const VelocityChart = React.memo(VelocityChartComponent);
