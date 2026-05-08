export type MetricEventType = "item_created" | "item_delegated" | "item_completed";

export interface MetricEvent {
  ts: string;
  type: MetricEventType;
  item_id: string;
  project: string;
  priority: string;
  agent: string;
}

export interface VelocityPoint {
  date: string;
  created: number;
  delegated: number;
  completed: number;
}

export interface SentinelRun {
  ts: string;
  mode: "on-demand" | "cron";
  scores: Record<string, number>;
  overall: "healthy" | "at-risk" | "stale";
}

export interface SentinelHistory {
  project: string;
  runs: Array<{ ts: string; score: number }>;
}
