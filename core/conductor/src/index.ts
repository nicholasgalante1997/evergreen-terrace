import { join } from "path";
import { config } from "@evergreen-terrace/common";
import { createStore } from "./store";
import { decomposeGoal } from "./mayor";
import { getDispatchable } from "./refinery";
import { startWitness } from "./witness";
import { executeBead } from "./polecat";

const CONDUCTOR_ROOT = process.env["CONDUCTOR_ROOT"] ?? process.cwd();
const beadsRoot = join(CONDUCTOR_ROOT, "context/beads");
const store = createStore(beadsRoot);

const PORT = config.conductor.server.port;
const MAX_CONCURRENT = config.conductor.maxConcurrent;

async function dispatchPending(): Promise<void> {
  const goals = await store.readGoals();
  for (const goal of goals) {
    if (goal.goal.status !== "in_progress") continue;
    const beads = await store.readBeads(goal.goal.id);
    const ready = getDispatchable(beads, MAX_CONCURRENT);
    for (const bead of ready) {
      executeBead(bead, store).then(async () => {
        await checkGoalCompletion(goal.goal.id);
        dispatchPending();
      });
    }
  }
}

async function checkGoalCompletion(goalId: string): Promise<void> {
  const beads = await store.readBeads(goalId);
  const allDone = beads.every((b) => b.bead.status === "completed" || b.bead.status === "failed");
  if (allDone && beads.length > 0) {
    const goals = await store.readGoals();
    const goal = goals.find((g) => g.goal.id === goalId);
    if (goal) {
      const anyFailed = beads.some((b) => b.bead.status === "failed");
      goal.goal.status = anyFailed ? "failed" : "completed";
      await store.writeGoal(goal);
    }
  }
}

const witness = startWitness(store);

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    try {
      const url = new URL(req.url);

      if (req.method === "POST" && url.pathname === "/conductor/goal") {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return Response.json({ error: "invalid JSON" }, { status: 400 });
        }
        if (typeof body !== "object" || body === null || typeof (body as Record<string, unknown>)["description"] !== "string") {
          return Response.json({ error: "description required" }, { status: 400 });
        }
        const { description } = body as { description: string };
        const goal = await decomposeGoal(description, store);
        dispatchPending();
        return Response.json({ id: goal.goal.id, status: goal.goal.status });
      }

      if (req.method === "GET" && url.pathname === "/conductor/goals") {
        const goals = await store.readGoals();
        const result = await Promise.all(
          goals.map(async (g) => {
            const beads = await store.readBeads(g.goal.id);
            return {
              ...g.goal,
              beads: beads.map((b) => ({ id: b.bead.id, title: b.bead.title, status: b.bead.status })),
            };
          }),
        );
        return Response.json(result);
      }

      if (req.method === "GET" && url.pathname.startsWith("/conductor/goal/")) {
        const id = url.pathname.slice("/conductor/goal/".length);
        const goals = await store.readGoals();
        const goal = goals.find((g) => g.goal.id === id);
        if (!goal) return Response.json({ error: "not found" }, { status: 404 });
        const beads = await store.readBeads(id);
        return Response.json({ ...goal.goal, beads });
      }

      if (req.method === "POST" && url.pathname.startsWith("/conductor/bead/") && url.pathname.endsWith("/retry")) {
        const beadId = url.pathname.slice("/conductor/bead/".length, -"/retry".length);
        const bead = await store.readBead(beadId);
        if (!bead) return Response.json({ error: "not found" }, { status: 404 });
        if (bead.bead.status !== "failed") {
          return Response.json({ error: "only failed beads can be retried" }, { status: 400 });
        }
        bead.bead.status = "pending";
        bead.bead.started = "";
        bead.bead.completed = "";
        bead.worker.session_id = "";
        await store.writeBead(bead);
        dispatchPending();
        return Response.json({ ok: true, id: beadId });
      }

      return new Response("Not found", { status: 404 });
    } catch (err: unknown) {
      console.error("[conductor] unhandled error:", err);
      return Response.json(
        { error: err instanceof Error ? err.message : "Internal server error" },
        { status: 500 },
      );
    }
  },
});

const shutdown = () => {
  console.log("[conductor] shutting down...");
  witness.stop();
  server.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`[conductor] listening on http://localhost:${PORT}`);
