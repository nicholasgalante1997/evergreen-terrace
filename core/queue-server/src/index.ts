import { join } from "path"
import { config } from "@evergreen-terrace/common"
import { createLogger } from "@evergreen-terrace/common/logger"
import type { MetricEvent, QueueItem } from "@evergreen-terrace/common"
import { createStore } from "./store"

const { log, dbg } = createLogger("queue-server")

const QUEUE_ROOT = process.env["QUEUE_ROOT"] ?? process.cwd()
const store = createStore(
  join(QUEUE_ROOT, "queue/inbox"),
  join(QUEUE_ROOT, "queue/active"),
  join(QUEUE_ROOT, "queue/completed")
)

const PORT = config.queue.server.port
const METRICS_URL = `http://localhost:${config.metrics.server.port}/metrics/event`
const CONDUCTOR_URL = `http://localhost:${config.conductor.server.port}/conductor/dispatch`

function emitMetric(event: MetricEvent): void {
  fetch(METRICS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event)
  }).catch((err: unknown) => {
    dbg("metrics emit failed: %O", err)
  })
}

// Non-blocking and fail-safe — if the conductor is not running, the queue
// dispatch still succeeds and the item moves to active/ normally.
function fireConductor(item: QueueItem): void {
  fetch(CONDUCTOR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item })
  })
    .then(async (res) => {
      if (res.ok) {
        const body = (await res.json()) as { goalId?: string; beadId?: string }
        log.info({ itemId: item.item.id, beadId: body.beadId ?? "?" }, "conductor accepted dispatch")
      } else {
        log.warn({ itemId: item.item.id, status: res.status }, "conductor rejected dispatch")
      }
    })
    .catch((err: unknown) => {
      dbg("conductor not available for %s: %O", item.item.id, err)
    })
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    try {
      const url = new URL(req.url)

      const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS_HEADERS })

      if (req.method === "GET" && url.pathname === "/health") {
        return json({ ok: true })
      }

      // --- Queue reads ---

      if (req.method === "GET" && url.pathname === "/queue") {
        const [inbox, active, completed] = await Promise.all([store.getInbox(), store.getActive(), store.getCompleted()])
        return json({ inbox, active, completed })
      }

      if (req.method === "GET" && url.pathname === "/queue/inbox") {
        return json(await store.getInbox())
      }

      if (req.method === "GET" && url.pathname === "/queue/active") {
        return json(await store.getActive())
      }

      if (req.method === "GET" && url.pathname === "/queue/completed") {
        return json(await store.getCompleted())
      }

      // --- Queue mutations ---

      if (req.method === "POST" && url.pathname === "/queue/delegate") {
        const body = await parseBody(req)
        if (!body) return json({ error: "invalid JSON" }, 400)

        const { id, agent } = body as { id?: string; agent?: string }
        if (typeof id !== "string" || typeof agent !== "string") {
          return json({ error: "id and agent required" }, 400)
        }

        const result = await store.delegateItem(id, agent)
        if (!result) return json({ ok: false }, 404)

        emitMetric({
          ts: new Date().toISOString(),
          type: "item_delegated",
          item_id: id,
          project: result.item.project,
          priority: result.item.priority,
          agent
        })

        // Fire conductor — non-blocking, fail-safe
        fireConductor(result)

        return json({ ok: true })
      }

      if (req.method === "POST" && url.pathname === "/queue/complete") {
        const body = await parseBody(req)
        if (!body) return json({ error: "invalid JSON" }, 400)

        const { id } = body as { id?: string }
        if (typeof id !== "string") return json({ error: "id required" }, 400)

        const active = await store.getActive()
        const item = active.find((i) => i.item.id === id)
        const ok = await store.completeItem(id)
        if (ok && item) {
          emitMetric({
            ts: new Date().toISOString(),
            type: "item_completed",
            item_id: id,
            project: item.item.project,
            priority: item.item.priority,
            agent: item.delegation.agent
          })
        }
        return json({ ok }, ok ? 200 : 404)
      }

      if (req.method === "POST" && url.pathname === "/queue/return") {
        const body = await parseBody(req)
        if (!body) return json({ error: "invalid JSON" }, 400)

        const { id } = body as { id?: string }
        if (typeof id !== "string") return json({ error: "id required" }, 400)

        const ok = await store.returnItem(id)
        return json({ ok }, ok ? 200 : 404)
      }

      return new Response("Not found", { status: 404, headers: CORS_HEADERS })
    } catch (err: unknown) {
      log.error({ err }, "unhandled request error")
      return Response.json(
        { error: err instanceof Error ? err.message : "Internal server error" },
        { status: 500, headers: CORS_HEADERS }
      )
    }
  }
})

async function parseBody(req: Request): Promise<unknown | null> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

const shutdown = () => {
  log.info("shutting down")
  server.stop()
  process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

log.info({ port: PORT }, "listening")
