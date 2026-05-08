import { useState, useEffect, useCallback } from "react";
import type { QueueState } from "@evergreen-terrace/common";

const QUEUE_URL = "";

export interface UseQueueResult extends QueueState {
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useQueue(pollMs = 0): UseQueueResult {
  const [state, setState] = useState<QueueState>({ inbox: [], active: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${QUEUE_URL}/queue`);
      if (!res.ok) throw new Error(`${res.status}`);
      setState((await res.json()) as QueueState);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "queue-server unreachable");
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
