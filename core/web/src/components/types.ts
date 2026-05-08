import type { QueueItem } from "@evergreen-terrace/common";
import type { VelocityPoint, SentinelHistory, QueueMetric } from "../hooks/useMetrics";

export interface SectionProps {
  title: string;
  items: QueueItem[];
}

export interface QueueItemProps {
  item: QueueItem;
}

export interface VelocityChartProps {
  data: VelocityPoint[];
}

export interface HealthSparklineProps {
  history: SentinelHistory;
}

export interface AgeDistributionProps {
  data: QueueMetric[];
}
