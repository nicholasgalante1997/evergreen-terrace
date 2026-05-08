import { resolve } from "path";
import { parse } from "toml";
import { config } from "@evergreen-terrace/common";
import { parseCron, matches, nextRun } from "./cron";
import { runSentinel } from "./runner";
import type { SentinelConfig, SentinelStatus } from "./types";

const CONTEXT_ROOT = process.env["QUEUE_ROOT"] ?? process.cwd();
const tomlPath = resolve(CONTEXT_ROOT, "context/global.toml");

const tomlContent = await Bun.file(tomlPath).text();
const parsed = parse(tomlContent) as { sentinel: SentinelConfig };
const sentinel = parsed.sentinel;

if (sentinel.mode === "on-demand") {
  process.exit(0);
}

// mode = "cron"
const fields = parseCron(sentinel.cron_schedule ?? "0 8 * * 1-5");
let lastReport = "";

// Load latest report if exists
const date = new Date().toISOString().slice(0, 10);
const reportPath = resolve(CONTEXT_ROOT, `context/reports/sentinel-${date}.md`);
const reportFile = Bun.file(reportPath);
if (await reportFile.exists()) {
  lastReport = await reportFile.text();
}

// Cron tick — check every 60s
const cronTimer = setInterval(async () => {
  try {
    const now = new Date();
    if (matches(fields, now)) {
      lastReport = await runSentinel();
    }
  } catch (err: unknown) {
    console.error("[sentinel] cron tick error:", err);
  }
}, 60_000);

// HTTP server
const port = config.sentinel.server.port;

const server = Bun.serve({
  port,
  fetch(req) {
    try {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/sentinel/latest") {
        return new Response(lastReport || "No report available.", {
          headers: { "Content-Type": "text/markdown" },
        });
      }

      if (req.method === "GET" && url.pathname === "/sentinel/status") {
        const status: SentinelStatus = {
          last_run: sentinel.last_run,
          mode: sentinel.mode,
          next_run: nextRun(fields, new Date()).toISOString(),
        };
        return Response.json(status);
      }

      return new Response("Not Found", { status: 404 });
    } catch (err: unknown) {
      console.error("[sentinel] unhandled error:", err);
      return Response.json(
        { error: err instanceof Error ? err.message : "Internal server error" },
        { status: 500 },
      );
    }
  },
});

const shutdown = () => {
  console.log("[sentinel] shutting down...");
  clearInterval(cronTimer);
  server.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`[sentinel] cron server running on port ${port}`);
