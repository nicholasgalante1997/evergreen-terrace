import { join } from "path";
import { config } from "@evergreen-terrace/common";
import type { MetricEvent } from "@evergreen-terrace/common";
import { createStore } from "./store";

// QUEUE_ROOT must be set to the repo root, or defaults to cwd.
// This is the single place path resolution happens — not in shared config.
const QUEUE_ROOT = process.env["QUEUE_ROOT"] ?? process.cwd();
const store = createStore(
  join(QUEUE_ROOT, "queue/inbox"),
  join(QUEUE_ROOT, "queue/active"),
);

const PORT = config.queue.server.port;
const METRICS_URL = `http://localhost:${config.metrics.server.port}/metrics/event`;

function emitMetric(event: MetricEvent): void {
  fetch(METRICS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  }).catch(() => {});
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    try {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/queue") {
        const [inbox, active] = await Promise.all([store.getInbox(), store.getActive()]);
        return Response.json({ inbox, active });
      }

      if (req.method === "GET" && url.pathname === "/queue/inbox") {
        return Response.json(await store.getInbox());
      }

      if (req.method === "GET" && url.pathname === "/queue/active") {
        return Response.json(await store.getActive());
      }

      if (req.method === "POST" && url.pathname === "/queue/delegate") {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return Response.json({ error: "invalid JSON" }, { status: 400 });
        }
        if (
          typeof body !== "object" || body === null ||
          typeof (body as Record<string, unknown>)["id"] !== "string" ||
          typeof (body as Record<string, unknown>)["agent"] !== "string"
        ) {
          return Response.json({ error: "id and agent required" }, { status: 400 });
        }
        const { id, agent } = body as { id: string; agent: string };
        const ok = await store.delegateItem(id, agent);
        if (ok) {
          const item = (await store.getActive()).find((i) => i.item.id === id);
          emitMetric({
            ts: new Date().toISOString(),
            type: "item_delegated",
            item_id: id,
            project: item?.item.project ?? "",
            priority: item?.item.priority ?? "",
            agent,
          });
        }
        return Response.json({ ok }, { status: ok ? 200 : 404 });
      }

      return new Response("Not found", { status: 404 });
    } catch (err: unknown) {
      console.error("[queue-server] unhandled error:", err);
      return Response.json(
        { error: err instanceof Error ? err.message : "Internal server error" },
        { status: 500 },
      );
    }
  },
});

const shutdown = () => {
  console.log("[queue-server] shutting down...");
  server.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`[queue-server] listening on http://localhost:${PORT}`);
