import { join } from "path";
import { config } from "@evergreen-terrace/common";
import { createMetricsStore } from "./store";
import type { MetricEvent, SentinelRun } from "./types";

const QUEUE_ROOT = process.env["QUEUE_ROOT"] ?? process.cwd();
const store = createMetricsStore(join(QUEUE_ROOT, "context/metrics"));

const PORT = config.metrics.server.port;

function isMetricEvent(value: unknown): value is MetricEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["ts"] === "string" &&
    typeof v["type"] === "string" &&
    typeof v["item_id"] === "string" &&
    typeof v["project"] === "string" &&
    typeof v["priority"] === "string" &&
    typeof v["agent"] === "string"
  );
}

function isSentinelRun(value: unknown): value is SentinelRun {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["ts"] === "string" &&
    (v["mode"] === "on-demand" || v["mode"] === "cron") &&
    typeof v["scores"] === "object" &&
    v["scores"] !== null &&
    (v["overall"] === "healthy" || v["overall"] === "at-risk" || v["overall"] === "stale")
  );
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    try {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/metrics/queue") {
        return Response.json(await store.getQueueEvents());
      }

      if (req.method === "GET" && url.pathname === "/metrics/queue/velocity") {
        return Response.json(await store.getVelocity());
      }

      if (req.method === "GET" && url.pathname === "/metrics/sentinel") {
        return Response.json(await store.getSentinelRuns());
      }

      if (req.method === "GET" && url.pathname === "/metrics/sentinel/history") {
        return Response.json(await store.getSentinelHistory());
      }

      if (req.method === "POST" && url.pathname === "/metrics/event") {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return Response.json({ error: "invalid JSON" }, { status: 400 });
        }
        if (!isMetricEvent(body)) {
          return Response.json({ error: "invalid metric event" }, { status: 400 });
        }
        await store.appendEvent(body);
        return Response.json({ ok: true });
      }

      if (req.method === "POST" && url.pathname === "/metrics/sentinel/run") {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return Response.json({ error: "invalid JSON" }, { status: 400 });
        }
        if (!isSentinelRun(body)) {
          return Response.json({ error: "invalid sentinel run" }, { status: 400 });
        }
        await store.appendSentinelRun(body);
        return Response.json({ ok: true });
      }

      return new Response("Not found", { status: 404 });
    } catch (err: unknown) {
      console.error("[metrics] unhandled error:", err);
      return Response.json(
        { error: err instanceof Error ? err.message : "Internal server error" },
        { status: 500 },
      );
    }
  },
});

const shutdown = () => {
  console.log("[metrics] shutting down...");
  server.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`[metrics] listening on http://localhost:${PORT}`);
