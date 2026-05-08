import { resolve } from "path";
import { config } from "@evergreen-terrace/common";

const CONTEXT_ROOT = process.env["QUEUE_ROOT"] ?? process.cwd();

async function spawnAsync(cmd: string[]): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  return stdout;
}

export async function runSentinel(): Promise<string> {
  const report = await spawnAsync(["kiro", "agent", "run", "momentum-sentinel"]);

  const date = new Date().toISOString().slice(0, 10);
  const reportsDir = resolve(CONTEXT_ROOT, "context/reports");
  await Bun.write(resolve(reportsDir, `sentinel-${date}.md`), report);

  // Fire-and-forget metrics notification
  const metricsUrl = `http://localhost:${config.queue.server.port}/metrics/event`;
  fetch(metricsUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "sentinel_run", date, success: true }),
  }).catch(() => {});

  // Update last_run in global.toml
  const tomlPath = resolve(CONTEXT_ROOT, "context/global.toml");
  const content = await Bun.file(tomlPath).text();
  const updated = content.replace(/last_run\s*=\s*".*?"/, `last_run = "${new Date().toISOString()}"`);
  await Bun.write(tomlPath, updated);

  return report;
}
