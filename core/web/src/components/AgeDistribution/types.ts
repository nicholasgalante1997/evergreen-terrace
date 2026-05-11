import type { QueueMetric } from "../../hooks/useMetrics"
export type { QueueMetric }

export interface AgeDistributionProps {
  data: QueueMetric[]
}

export interface AgeBucket {
  name: string
  count: number
}

export interface AgeDistributionViewProps {
  buckets: AgeBucket[]
}
