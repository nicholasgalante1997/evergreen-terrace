import { resolve } from "path"
import { parse } from "toml"
import { config } from "@evergreen-terrace/common"
import { createLogger } from "@evergreen-terrace/common/logger"
import { parseCron, matches, nextRun } from "./cron"
import { runSentinel } from "./runner"
import type { SentinelConfig, SentinelStatus } from "./types"

const { log, dbg } = createLogger("sentinel")

const CONTEXT_ROOT = process.env["QUEUE_ROOT"] ?? process.cwd()
const tomlPath = resolve(CONTEXT_ROOT, "context/global.toml")

const tomlContent = await Bun.file(tomlPath).text()
const parsed = parse(tomlContent) as { sentinel: SentinelConfig }
const sentinel = parsed.sentinel

const port = config.sentinel.server.port

// Load latest report from disk if it exists
let lastReport = ""
const reportsDir = resolve(CONTEXT_ROOT, "context/reports")
const todayReport = Bun.file(resolve(reportsDir, `sentinel-${new Date().toISOString().slice(0, 10)}.md`))
if (await todayReport.exists()) {
  lastReport = await todayReport.text()
}

// Track whether a run is currently in progress (prevents concurrent runs)
let runInProgress = false

// Cron mode — set up the tick timer
if (sentinel.mode === "cron") {
  const fields = parseCron(sentinel.cron_schedule ?? "0 8 * * 1-5")
  setInterval(async () => {
    if (runInProgress) return
    try {
      const now = new Date()
      if (matches(fields, now)) {
        dbg("cron tick matched at %s — starting run", now.toISOString())
        runInProgress = true
        lastReport = await runSentinel()
        runInProgress = false
      }
    } catch (err: unknown) {
      runInProgress = false
      log.error({ err }, "cron tick error")
    }
  }, 60_000)

  log.info({ schedule: sentinel.cron_schedule }, "cron mode")
} else {
  log.info("on-demand mode — POST /sentinel/run to trigger")
}

// HTTP server — always starts regardless of mode
const server = Bun.serve({
  port,
  async fetch(req) {
    try {
      const url = new URL(req.url)

      if (req.method === "GET" && url.pathname === "/health") {
        return Response.json({ ok: true, mode: sentinel.mode })
      }

      if (req.method === "GET" && url.pathname === "/sentinel/latest") {
        if (!lastReport) {
          return new Response("No report available. POST /sentinel/run to generate one.", {
            status: 404,
            headers: { "Content-Type": "text/plain" }
          })
        }
        return new Response(lastReport, {
          headers: { "Content-Type": "text/markdown" }
        })
      }

      if (req.method === "GET" && url.pathname === "/sentinel/status") {
        const cronFields = sentinel.cron_schedule ? parseCron(sentinel.cron_schedule) : null
        const status: SentinelStatus = {
          last_run: sentinel.last_run ?? "",
          mode: sentinel.mode,
          next_run: cronFields ? nextRun(cronFields, new Date()).toISOString() : null,
          run_in_progress: runInProgress
        }
        return Response.json(status)
      }

      // POST /sentinel/run — trigger an on-demand run
      if (req.method === "POST" && url.pathname === "/sentinel/run") {
        if (runInProgress) {
          return Response.json({ error: "run already in progress" }, { status: 409 })
        }
        runInProgress = true
        try {
          lastReport = await runSentinel()
          runInProgress = false
          return Response.json({ ok: true, length: lastReport.length })
        } catch (err: unknown) {
          runInProgress = false
          const msg = err instanceof Error ? err.message : "run failed"
          log.error({ err }, "run error")
          return Response.json({ error: msg }, { status: 500 })
        }
      }

      return new Response("Not Found", { status: 404 })
    } catch (err: unknown) {
      log.error({ err }, "unhandled request error")
      return Response.json({ error: err instanceof Error ? err.message : "Internal server error" }, { status: 500 })
    }
  }
})

const shutdown = () => {
  log.info("shutting down")
  server.stop()
  process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

log.info({ port }, "server running")
