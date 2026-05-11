import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import type { AgeDistributionViewProps } from "./types"

export function AgeDistributionView({ buckets }: AgeDistributionViewProps) {
  return (
    <figure className="chart-container">
      <ResponsiveContainer
        width="100%"
        height={160}
      >
        <BarChart data={buckets}>
          <XAxis
            dataKey="name"
            stroke="#4b5563"
            fontSize={10}
          />
          <YAxis
            stroke="#4b5563"
            fontSize={10}
          />
          <Tooltip contentStyle={{ background: "#1f2937", border: "none", fontSize: 12 }} />
          <Bar
            dataKey="count"
            fill="#6366f1"
          />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}
