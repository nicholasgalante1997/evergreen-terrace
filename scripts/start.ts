#!/usr/bin/env bun
/**
 * scripts/start.ts
 *
 * Starts all evergreen-terrace services and opens the dashboard in the browser.
 * Kills all children on Ctrl+C or process exit.
 *
 * Usage:
 *   bun scripts/start.ts              # start everything
 *   bun scripts/start.ts --no-browser # skip browser open
 *   bun scripts/start.ts --no-build   # skip rebuild before start
 */

import { join } from "path";
import { spawn, type Subprocess } from "bun";

const ROOT = process.env["REPO_ROOT"] ?? import.meta.dir.replace(/\/scripts$/, "");

const ARGS = new Set(process.argv.slice(2));
const NO_BROWSER = ARGS.has("--no-browser");
const NO_BUILD = ARGS.has("--no-build");

const DASHBOARD_URL = "http://localhost:2728";

interface Service {
  name: string;
  cmd: string[];
  color: string;
  /** If true, continue even if this service exits early (e.g. sentinel on-demand) */
  optional?: boolean;
  port: number;
}

// ANSI color codes for log prefixes
const C = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  cyan:    "\x1b[36m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  magenta: "\x1b[35m",
  blue:    "\x1b[34m",
  red:     "\x1b[31m",
  gray:    "\x1b[90m",
};

const SERVICES: Service[] = [
  {
    name: "queue-server",
    cmd: ["bun", "run", join(ROOT, "core/queue-server/dist/index.js")],
    color: C.cyan,
    port: 2727,
  },
  {
    name: "sentinel",
    cmd: ["bun", "run", join(ROOT, "core/sentinel/dist/index.js")],
    color: C.magenta,
    port: 2730
  },
  {
    name: "metrics",
    cmd: ["bun", "run", join(ROOT, "core/metrics/dist/index.js")],
    color: C.yellow,
    optional: true,
    port: 2729
  },
  {
    name: "conductor",
    cmd: ["bun", "run", join(ROOT, "core/conductor/dist/index.js")],
    color: C.blue,
    optional: true,
    port: 2731
  },
  {
    name: "dashboard",
    // Dev mode for hot-reload; use `bun run build && serve` for prod
    cmd: ["bun", "run", "--cwd", join(ROOT, "core/web"), "dev"],
    color: C.green,
    port: 2728,
  },
];

const QUEUE_SVC = SERVICES.find(svc => svc.name ===  "queue-server")!;
const SENTINEL_SVC = SERVICES.find(svc => svc.name === "sentinel")!;
const METRICS_SVC = SERVICES.find(svc => svc.name === "metrics")!;
const CONDUCTOR_SVC = SERVICES.find(svc => svc.name === "conductor")!;
const WEB_SVC = SERVICES.find(svc => svc.name === "dashboard")!;

function log(name: string, color: string, line: string) {
  const prefix = `${color}${C.bold}[${name}]${C.reset}`;
  console.log(`${prefix} ${line}`);
}

function logSys(line: string) {
  console.log(`${C.gray}[start]${C.reset} ${line}`);
}

// ── Build ────────────────────────────────────────────────────────────────────

if (!NO_BUILD) {
  logSys("Building services (turbo run build)…");
  const build = spawn(["bun", "run", "build"], {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await build.exited;
  if (code !== 0) {
    logSys(`${C.red}Build failed (exit ${code}). Run with --no-build to skip.${C.reset}`);
    process.exit(1);
  }
  logSys("Build complete.");
}

// ── Spawn services ───────────────────────────────────────────────────────────

const procs: Map<string, Subprocess> = new Map();

for (const svc of SERVICES) {
  const proc = spawn(svc.cmd, {
    cwd: ROOT,
    env: { ...process.env, QUEUE_ROOT: ROOT },
    stdout: "pipe",
    stderr: "pipe",
  });

  procs.set(svc.name, proc);

  // Pipe stdout line-by-line with colored prefix
  const pipeStream = async (stream: ReadableStream<Uint8Array> | null, isErr = false) => {
    if (!stream) return;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) log(svc.name, isErr ? C.red : svc.color, line);
      }
    }
    if (buffer.trim()) log(svc.name, isErr ? C.red : svc.color, buffer);
  };

  void pipeStream(proc.stdout);
  void pipeStream(proc.stderr, true);

  // Watch for unexpected exits
  proc.exited.then((code) => {
    if (!shuttingDown) {
      if (!svc.optional || code !== 0) {
        log(svc.name, C.red, `exited with code ${code}`);
      }
    }
  });
}

// ── Wait for services to be ready ───────────────────────────────────────────

async function pollService(port: number) {
  const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(500) });
  if (res.ok || res.status < 500) return true;
  return false;
}

async function waitForPort(port: number, maxMs = 10_000): Promise<boolean> {
  let incrementalBackoff = 300;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const alive = await pollService(port);
      if (alive) return true;
    } catch {
      await Bun.sleep(incrementalBackoff);
      incrementalBackoff = incrementalBackoff + 100;
    }
  }
  return false;
}

logSys("Waiting for queue-server (port 2727)…");
const queueReady = await waitForPort(QUEUE_SVC.port!);
if (!queueReady) {
  logSys(`${C.yellow}queue-server did not become ready in time — continuing anyway${C.reset}`);
} else {
  logSys("queue-server ready.");
}

logSys("Waiting for sentinel (port 2730)…");
const sentinelReady = await waitForPort(2730, 8_000);
if (!sentinelReady) {
  logSys(`${C.yellow}sentinel did not become ready — continuing anyway${C.reset}`);
} else {
  logSys("sentinel ready.");
}

// ── Open browser ─────────────────────────────────────────────────────────────

if (!NO_BROWSER) {
  // Small delay for dashboard vite dev server to be ready
  await Bun.sleep(2500);
  logSys(`Opening ${DASHBOARD_URL}`);
  spawn(["xdg-open", DASHBOARD_URL], { stdout: "ignore", stderr: "ignore" });
}

logSys(`${C.green}All services started.${C.reset} Press Ctrl+C to stop all.`);
logSys(`  Dashboard:    ${DASHBOARD_URL}`);
logSys(`  Queue server: http://localhost:2727`);
logSys(`  Sentinel:     http://localhost:2730`);
logSys(`  Metrics:      http://localhost:2729`);
logSys(`  Conductor:    http://localhost:2731`);

// ── Graceful shutdown ────────────────────────────────────────────────────────

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logSys(`${signal} — stopping all services…`);
  for (const [name, proc] of procs) {
    try {
      proc.kill("SIGTERM");
      logSys(`stopped ${name}`);
    } catch {
      // already gone
    }
  }
  process.exit(0);
}

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Keep the process alive
await new Promise<never>(() => {});
