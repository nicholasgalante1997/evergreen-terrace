import { useState, useEffect, useCallback } from "react";

export interface VelocityPoint {
  date: string;
  created: number;
  delegated: number;
  completed: number;
}

export interface SentinelRun {
  project: string;
  score: number;
  timestamp: string;
}

export interface SentinelHistory {
  project: string;
  runs: SentinelRun[];
}

export interface QueueMetric {
  id: string;
  project: string;
  createdAt: string;
  delegatedAt?: string;
}

export interface MetricsState {
  velocity: VelocityPoint[];
  sentinelHistory: SentinelHistory[];
  queueMetrics: QueueMetric[];
}

export interface UseMetricsResult extends MetricsState {
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMetrics(pollMs = 0): UseMetricsResult {
  const [state, setState] = useState<MetricsState>({
    velocity: [],
    sentinelHistory: [],
    queueMetrics: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [velRes, histRes, queueRes] = await Promise.all([
        fetch("/metrics/queue/velocity"),
        fetch("/metrics/sentinel/history"),
        fetch("/metrics/queue"),
      ]);
      if (!velRes.ok || !histRes.ok || !queueRes.ok) throw new Error("fetch failed");
      setState({
        velocity: (await velRes.json()) as VelocityPoint[],
        sentinelHistory: (await histRes.json()) as SentinelHistory[],
        queueMetrics: (await queueRes.json()) as QueueMetric[],
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "metrics service unreachable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (pollMs > 0) {
      const id = setInterval(() => void refresh(), pollMs);
      return () => clearInterval(id);
    }
  }, [refresh, pollMs]);

  return { ...state, loading, error, refresh };
}
