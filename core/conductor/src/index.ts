import { join } from "path"
import { randomUUID } from "crypto"
import { config } from "@evergreen-terrace/common"
import type { QueueItem } from "@evergreen-terrace/common"
import { createStore } from "./store"
import { decomposeGoal } from "./mayor"
import { getDispatchable } from "./refinery"
import { startWitness } from "./witness"
import { executeBead, prepareBeadPrompt } from "./polecat"
import { resolveProjectDir } from "./project"
import { queryEvents, queryUsageSummary, executeQuery } from "./db"
import type { Bead, AgentRole, BeadStatus } from "./types"

const CONDUCTOR_ROOT = process.env["CONDUCTOR_ROOT"] ?? process.cwd()
const beadsRoot = join(CONDUCTOR_ROOT, "context/beads")
const store = createStore(beadsRoot)

const PORT = config.conductor.server.port
const MAX_CONCURRENT = config.conductor.maxConcurrent

const QUEUE_URL = `http://localhost:${config.queue.server.port}`

const TERMINAL_STATUSES: BeadStatus[] = ["completed", "failed", "review_pending"]

interface WsData {
  beadId: string
  goalId: string
  lineOffset: number
  intervalId: ReturnType<typeof setInterval> | null
}

// ── Dispatch loop ────────────────────────────────────────────────────────────

async function dispatchPending(): Promise<void> {
  const goals = await store.readGoals()
  for (const goal of goals) {
    if (goal.goal.status !== "in_progress") continue
    const beads = await store.readBeads(goal.goal.id)
    const ready = getDispatchable(beads, MAX_CONCURRENT)
    for (const bead of ready) {
      executeBead(bead, store).then(async () => {
        await checkGoalCompletion(goal.goal.id)
        dispatchPending()
      })
    }
  }
}

async function checkGoalCompletion(goalId: string): Promise<void> {
  const beads = await store.readBeads(goalId)
  const allSettled = beads.every(
    (b) => b.bead.status === "completed" || b.bead.status === "failed" || b.bead.status === "review_pending"
  )
  if (allSettled && beads.length > 0) {
    const goals = await store.readGoals()
    const goal = goals.find((g) => g.goal.id === goalId)
    if (goal) {
      const anyFailed = beads.some((b) => b.bead.status === "failed")
      const anyPendingReview = beads.some((b) => b.bead.status === "review_pending")
      goal.goal.status = anyFailed ? "failed" : anyPendingReview ? "in_progress" : "completed"
      await store.writeGoal(goal)
    }
  }
}

async function resumeFromDisk(): Promise<void> {
  const allBeads = await store.readAllBeads()
  let reset = 0
  for (const bead of allBeads) {
    if (bead.bead.status === "in_progress") {
      bead.bead.status = "pending"
      bead.bead.started = ""
      bead.worker.session_id = ""
      await store.writeBead(bead)
      reset++
    }
  }
  if (reset > 0) {
    console.log(`[conductor] reset ${reset} stale in_progress bead(s) on startup`)
  }
  await dispatchPending()
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
}

async function parseBody(req: Request): Promise<unknown | null> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

// ── Create a bead directly from a queue item (no decomposition) ──────────────

async function createBeadFromQueueItem(item: QueueItem): Promise<{ goalId: string; beadId: string }> {
  const goalId = `goal-${randomUUID().slice(0, 8)}`

  // Resolve project working directory — CRITICAL CONSTRAINT
  // If this returns null, the bead will run in the conductor root (wrong dir).
  // Verify context/projects/{project}.toml has a repo field before dispatching feature tickets.
  const projectDir = await resolveProjectDir(item.item.project)
  if (!projectDir) {
    console.warn(
      `[conductor] no repo path for project "${item.item.project}" — ` +
        `bead will run in conductor root. ` +
        `Add repo field to context/projects/${item.item.project}.toml to fix.`
    )
  }
  const cwd = projectDir ?? CONDUCTOR_ROOT

  await store.writeGoal({
    goal: {
      id: goalId,
      description: item.item.title,
      status: "in_progress",
      created: new Date().toISOString(),
      queue_item_id: item.item.id
    }
  })

  const beadId = `bead-${goalId.slice(5)}-001`
  const bead: Bead = {
    bead: {
      id: beadId,
      goal_id: goalId,
      title: item.item.title,
      role: (item.delegation.agent || "eng-mid") as AgentRole,
      status: "prompt_pending",
      item_type: item.item.type,
      created: new Date().toISOString(),
      started: "",
      completed: ""
    },
    task: {
      description: item.context.description,
      acceptance: item.context.acceptance,
      context_files: item.context.links,
      output_files: []
    },
    worker: {
      session_id: "",
      cwd,
      project: item.item.project,
      queue_item_id: item.item.id
    }
  }

  await store.writeBead(bead)

  // Build and save prompts in the background so the UI can show them for review
  prepareBeadPrompt(bead, store).catch((err: unknown) => {
    console.error(`[conductor] prompt prep failed for ${beadId}:`, err)
  })

  return { goalId, beadId }
}

// ── Notify queue-server that a bead is complete ──────────────────────────────

async function notifyQueueComplete(queueItemId: string): Promise<void> {
  try {
    await fetch(`${QUEUE_URL}/queue/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: queueItemId })
    })
  } catch {
    console.warn(`[conductor] could not notify queue-server of completion for ${queueItemId}`)
  }
}

// ── Witness + server ─────────────────────────────────────────────────────────

const witness = startWitness(store)

const server = Bun.serve<WsData>({
  port: PORT,

  websocket: {
    open(ws) {
      let ticking = false
      const id = setInterval(() => {
        if (ticking) return
        ticking = true
        void (async () => {
          try {
            const { events, totalLines } = await store.readEvents(ws.data.goalId, ws.data.beadId, ws.data.lineOffset)
            ws.data.lineOffset = totalLines
            for (const event of events) {
              ws.send(JSON.stringify(event))
            }
            const current = await store.readBead(ws.data.beadId)
            if (current && TERMINAL_STATUSES.includes(current.bead.status)) {
              ws.send(JSON.stringify({ type: "done", status: current.bead.status }))
              clearInterval(ws.data.intervalId!)
              ws.data.intervalId = null
              ws.close()
            }
          } catch (err) {
            console.error("[conductor] WS tick error:", err)
          } finally {
            ticking = false
          }
        })()
      }, 500)
      ws.data.intervalId = id
    },

    close(ws) {
      if (ws.data.intervalId !== null) {
        clearInterval(ws.data.intervalId)
        ws.data.intervalId = null
      }
    },

    message() {
      /* server-to-client only — no inbound messages */
    }
  },

  async fetch(req, server) {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS })
    }

    const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS })

    try {
      const url = new URL(req.url)

      if (req.method === "GET" && url.pathname === "/health") {
        return json({ ok: true })
      }

      // ── Queue-item dispatch ────────────────────────────────────────────────

      if (req.method === "POST" && url.pathname === "/conductor/dispatch") {
        const body = await parseBody(req)
        if (!body || typeof body !== "object") {
          return json({ error: "body must be { item: QueueItem }" }, 400)
        }
        const item = (body as Record<string, unknown>)["item"] as QueueItem | undefined
        if (!item?.item?.id) return json({ error: "item.item.id required" }, 400)

        const { goalId, beadId } = await createBeadFromQueueItem(item)
        dispatchPending()
        console.log(`[conductor] dispatched ${item.item.id} → goal ${goalId} / bead ${beadId}`)
        return json({ goalId, beadId })
      }

      // ── Goal decomposition (original path) ────────────────────────────────

      if (req.method === "POST" && url.pathname === "/conductor/goal") {
        const body = await parseBody(req)
        if (!body || typeof (body as Record<string, unknown>)["description"] !== "string") {
          return json({ error: "description required" }, 400)
        }
        const { description } = body as { description: string }
        const goal = await decomposeGoal(description, store)
        dispatchPending()
        return json({ id: goal.goal.id, status: goal.goal.status })
      }

      if (req.method === "GET" && url.pathname === "/conductor/goals") {
        const goals = await store.readGoals()
        const result = await Promise.all(
          goals.map(async (g) => {
            const beads = await store.readBeads(g.goal.id)
            return {
              ...g.goal,
              beads: beads.map((b) => ({
                id: b.bead.id,
                title: b.bead.title,
                status: b.bead.status,
                role: b.bead.role
              }))
            }
          })
        )
        return json(result)
      }

      if (req.method === "GET" && url.pathname.startsWith("/conductor/goal/")) {
        const id = url.pathname.slice("/conductor/goal/".length)
        const goals = await store.readGoals()
        const goal = goals.find((g) => g.goal.id === id)
        if (!goal) return json({ error: "not found" }, 404)
        const beads = await store.readBeads(id)
        return json({ ...goal.goal, beads })
      }

      // ── Bead lookup by queue item id ──────────────────────────────────────

      if (req.method === "GET" && url.pathname.startsWith("/conductor/queue-item/")) {
        const queueItemId = url.pathname.slice("/conductor/queue-item/".length)
        const bead = await store.findBeadByQueueItemId(queueItemId)
        if (!bead) return json({ error: "no bead for this queue item" }, 404)
        return json(bead)
      }

      // ── Bead prompt: read ────────────────────────────────────────────────

      if (req.method === "GET" && url.pathname.startsWith("/conductor/bead/") && url.pathname.endsWith("/prompt")) {
        const beadId = url.pathname.slice("/conductor/bead/".length, -"/prompt".length)
        const bead = await store.readBead(beadId)
        if (!bead) return json({ error: "bead not found" }, 404)

        const [prompt, systemPrompt] = await Promise.all([
          store.readBeadPrompt(bead.bead.goal_id, beadId),
          store.readBeadSystemPrompt(bead.bead.goal_id, beadId)
        ])
        return json({ prompt, systemPrompt })
      }

      // ── Bead prompt: approve / dispatch with optional edit ────────────────

      if (req.method === "POST" && url.pathname.startsWith("/conductor/bead/") && url.pathname.endsWith("/prompt")) {
        const beadId = url.pathname.slice("/conductor/bead/".length, -"/prompt".length)
        const bead = await store.readBead(beadId)
        if (!bead) return json({ error: "bead not found" }, 404)
        if (bead.bead.status !== "prompt_pending") {
          return json({ error: "only prompt_pending beads can be dispatched here" }, 400)
        }

        const body = (await parseBody(req)) as Record<string, unknown> | null
        if (body?.["prompt"] && typeof body["prompt"] === "string") {
          await store.writeBeadPrompt(bead.bead.goal_id, beadId, body["prompt"])
        }

        bead.bead.status = "pending"
        await store.writeBead(bead)
        dispatchPending()
        return json({ ok: true, beadId })
      }

      // ── Bead WebSocket stream ─────────────────────────────────────────────

      if (req.method === "GET" && url.pathname.startsWith("/conductor/bead/") && url.pathname.endsWith("/ws")) {
        const beadId = url.pathname.slice("/conductor/bead/".length, -"/ws".length)
        const bead = await store.readBead(beadId)
        if (!bead) return json({ error: "bead not found" }, 404)

        const upgraded = server.upgrade(req, {
          headers: CORS,
          data: { beadId, goalId: bead.bead.goal_id, lineOffset: 0, intervalId: null }
        })
        if (upgraded) return undefined
        return new Response("WebSocket upgrade failed", { status: 426 })
      }

      // ── Bead approve ──────────────────────────────────────────────────────

      if (req.method === "POST" && url.pathname.startsWith("/conductor/bead/") && url.pathname.endsWith("/approve")) {
        const beadId = url.pathname.slice("/conductor/bead/".length, -"/approve".length)
        const bead = await store.readBead(beadId)
        if (!bead) return json({ error: "bead not found" }, 404)
        if (bead.bead.status !== "review_pending") {
          return json({ error: "only review_pending beads can be approved" }, 400)
        }
        bead.bead.status = "completed"
        bead.bead.completed = new Date().toISOString()
        await store.writeBead(bead)
        await checkGoalCompletion(bead.bead.goal_id)
        if (bead.worker.queue_item_id) await notifyQueueComplete(bead.worker.queue_item_id)
        return json({ ok: true })
      }

      // ── Bead reject ───────────────────────────────────────────────────────

      if (req.method === "POST" && url.pathname.startsWith("/conductor/bead/") && url.pathname.endsWith("/reject")) {
        const beadId = url.pathname.slice("/conductor/bead/".length, -"/reject".length)
        const bead = await store.readBead(beadId)
        if (!bead) return json({ error: "bead not found" }, 404)
        if (bead.bead.status !== "review_pending") {
          return json({ error: "only review_pending beads can be rejected" }, 400)
        }
        bead.bead.status = "failed"
        bead.bead.completed = new Date().toISOString()
        await store.writeBead(bead)
        store.appendEvent(
          bead.bead.goal_id,
          bead.bead.id,
          {
            ts: new Date().toISOString(),
            type: "status",
            content: "rejected by reviewer"
          },
          { queueItemId: bead.worker.queue_item_id, project: bead.worker.project }
        )
        return json({ ok: true })
      }

      // ── Bead retry ────────────────────────────────────────────────────────

      if (req.method === "POST" && url.pathname.startsWith("/conductor/bead/") && url.pathname.endsWith("/retry")) {
        const beadId = url.pathname.slice("/conductor/bead/".length, -"/retry".length)
        const bead = await store.readBead(beadId)
        if (!bead) return json({ error: "not found" }, 404)
        if (bead.bead.status !== "failed") {
          return json({ error: "only failed beads can be retried" }, 400)
        }
        bead.bead.status = "pending"
        bead.bead.started = ""
        bead.bead.completed = ""
        bead.worker.session_id = ""
        await store.writeBead(bead)
        dispatchPending()
        return json({ ok: true, id: beadId })
      }

      // ── Event history ─────────────────────────────────────────────────────

      if (req.method === "GET" && url.pathname === "/conductor/events") {
        const p = url.searchParams
        const events = queryEvents({
          bead_id: p.get("bead_id") ?? undefined,
          goal_id: p.get("goal_id") ?? undefined,
          queue_item_id: p.get("queue_item_id") ?? undefined,
          project: p.get("project") ?? undefined,
          type: p.get("type") ?? undefined,
          since: p.get("since") ?? undefined,
          limit: p.has("limit") ? Number(p.get("limit")) : undefined,
          offset: p.has("offset") ? Number(p.get("offset")) : undefined
        })
        return json({ events, count: events.length })
      }

      // ── Usage summary (cost + token aggregates by project) ────────────────

      if (req.method === "GET" && url.pathname === "/conductor/usage") {
        const since = url.searchParams.get("since") ?? undefined
        return json(queryUsageSummary(since))
      }

      // ── SQL query playground (read-only) ──────────────────────────────────

      if (req.method === "POST" && url.pathname === "/conductor/query") {
        const body = (await parseBody(req)) as Record<string, unknown> | null
        const sql = typeof body?.["sql"] === "string" ? body["sql"] : ""
        return json(executeQuery(sql))
      }

      return new Response("Not found", { status: 404, headers: CORS })
    } catch (err: unknown) {
      console.error("[conductor] unhandled error:", err)
      return json({ error: err instanceof Error ? err.message : "Internal server error" }, 500)
    }
  }
})

const shutdown = () => {
  console.log("[conductor] shutting down...")
  witness.stop()
  server.stop()
  process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

void resumeFromDisk()

console.log(`[conductor] listening on http://localhost:${PORT}`)
