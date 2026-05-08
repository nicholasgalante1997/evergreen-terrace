import { randomUUID } from "crypto";
import type { Bead } from "./types";
import type { createStore } from "./store";

function spawnAsync(cmd: string, args: string[]): Promise<{ exitCode: number; stdout: string }> {
  const proc = Bun.spawn([cmd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return proc.exited.then(async (exitCode) => {
    const stdout = await new Response(proc.stdout).text();
    return { exitCode, stdout };
  });
}

export async function executeBead(
  bead: Bead,
  store: ReturnType<typeof createStore>,
): Promise<void> {
  const sessionId = randomUUID();
  bead.bead.status = "in_progress";
  bead.bead.started = new Date().toISOString();
  bead.worker.session_id = sessionId;
  await store.writeBead(bead);

  const prompt = [
    `Task: ${bead.bead.title}`,
    `Description: ${bead.task.description}`,
    `Acceptance: ${bead.task.acceptance}`,
    bead.task.context_files.length > 0 ? `Context files: ${bead.task.context_files.join(", ")}` : "",
    bead.task.output_files.length > 0 ? `Output files: ${bead.task.output_files.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  try {
    const result = await spawnAsync("kiro", [
      "agent", "run", bead.bead.role, "--prompt", prompt,
    ]);

    if (result.exitCode === 0) {
      bead.bead.status = "completed";
    } else {
      bead.bead.status = "failed";
    }
  } catch {
    bead.bead.status = "failed";
  }

  bead.bead.completed = new Date().toISOString();
  await store.writeBead(bead);
}
