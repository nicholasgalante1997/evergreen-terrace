import { join } from "path";
import { mkdir } from "fs/promises";
import TOML from "toml";
import type { Bead, Goal } from "./types";

function escape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function serializeBead(bead: Bead): string {
  return [
    `[bead]`,
    `id = "${escape(bead.bead.id)}"`,
    `goal_id = "${escape(bead.bead.goal_id)}"`,
    `title = "${escape(bead.bead.title)}"`,
    `role = "${escape(bead.bead.role)}"`,
    `status = "${escape(bead.bead.status)}"`,
    `created = "${bead.bead.created}"`,
    `started = "${bead.bead.started}"`,
    `completed = "${bead.bead.completed}"`,
    ``,
    `[task]`,
    `description = "${escape(bead.task.description)}"`,
    `acceptance = "${escape(bead.task.acceptance)}"`,
    `context_files = [${bead.task.context_files.map((f) => `"${escape(f)}"`).join(", ")}]`,
    `output_files = [${bead.task.output_files.map((f) => `"${escape(f)}"`).join(", ")}]`,
    ``,
    `[worker]`,
    `session_id = "${escape(bead.worker.session_id)}"`,
  ].join("\n");
}

function serializeGoal(goal: Goal): string {
  return [
    `[goal]`,
    `id = "${escape(goal.goal.id)}"`,
    `description = "${escape(goal.goal.description)}"`,
    `status = "${escape(goal.goal.status)}"`,
    `created = "${goal.goal.created}"`,
  ].join("\n");
}

export function createStore(beadsRoot: string) {
  async function ensureGoalDir(goalId: string): Promise<string> {
    const dir = join(beadsRoot, goalId);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async function writeGoal(goal: Goal): Promise<void> {
    const dir = await ensureGoalDir(goal.goal.id);
    await Bun.write(join(dir, "goal.toml"), serializeGoal(goal));
  }

  async function writeBead(bead: Bead): Promise<void> {
    const dir = await ensureGoalDir(bead.bead.goal_id);
    await Bun.write(join(dir, `${bead.bead.id}.toml`), serializeBead(bead));
  }

  async function readGoals(): Promise<Goal[]> {
    const glob = new Bun.Glob("*/goal.toml");
    const goals: Goal[] = [];
    for await (const file of glob.scan(beadsRoot)) {
      const text = await Bun.file(join(beadsRoot, file)).text();
      try {
        goals.push(TOML.parse(text) as Goal);
      } catch {
        console.error(`[conductor] failed to parse ${file}`);
      }
    }
    return goals;
  }

  async function readBeads(goalId: string): Promise<Bead[]> {
    const dir = join(beadsRoot, goalId);
    const glob = new Bun.Glob("bead-*.toml");
    const beads: Bead[] = [];
    for await (const file of glob.scan(dir)) {
      const text = await Bun.file(join(dir, file)).text();
      try {
        beads.push(TOML.parse(text) as Bead);
      } catch {
        console.error(`[conductor] failed to parse ${file}`);
      }
    }
    return beads;
  }

  async function readAllBeads(): Promise<Bead[]> {
    const goals = await readGoals();
    const all: Bead[] = [];
    for (const goal of goals) {
      const beads = await readBeads(goal.goal.id);
      all.push(...beads);
    }
    return all;
  }

  async function readBead(beadId: string): Promise<Bead | undefined> {
    const glob = new Bun.Glob(`*/${beadId}.toml`);
    for await (const file of glob.scan(beadsRoot)) {
      const text = await Bun.file(join(beadsRoot, file)).text();
      try {
        return TOML.parse(text) as Bead;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  return { writeGoal, writeBead, readGoals, readBeads, readAllBeads, readBead, ensureGoalDir };
}
