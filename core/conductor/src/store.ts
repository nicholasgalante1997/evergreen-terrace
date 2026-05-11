import { join } from "path"
import { mkdir } from "fs/promises"
import { appendFileSync, existsSync } from "node:fs"
import TOML from "toml"
import type { Bead, Goal, BeadEvent } from "./types"
import { insertEvent } from "./db"

function escape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function serializeString(key: string, value: string): string {
  if (value.includes("\n")) return `${key} = """\n${value}\n"""`
  return `${key} = "${escape(value)}"`
}

function serializeBead(bead: Bead): string {
  return [
    `[bead]`,
    `id = "${escape(bead.bead.id)}"`,
    `goal_id = "${escape(bead.bead.goal_id)}"`,
    `title = "${escape(bead.bead.title)}"`,
    `role = "${escape(bead.bead.role)}"`,
    `status = "${escape(bead.bead.status)}"`,
    `item_type = "${escape(bead.bead.item_type)}"`,
    `created = "${bead.bead.created}"`,
    `started = "${bead.bead.started}"`,
    `completed = "${bead.bead.completed}"`,
    ``,
    `[task]`,
    serializeString("description", bead.task.description),
    serializeString("acceptance", bead.task.acceptance),
    `context_files = [${bead.task.context_files.map((f) => `"${escape(f)}"`).join(", ")}]`,
    `output_files = [${bead.task.output_files.map((f) => `"${escape(f)}"`).join(", ")}]`,
    ``,
    `[worker]`,
    `session_id = "${escape(bead.worker.session_id)}"`,
    `cwd = "${escape(bead.worker.cwd)}"`,
    `project = "${escape(bead.worker.project)}"`,
    `queue_item_id = "${escape(bead.worker.queue_item_id)}"`
  ].join("\n")
}

function serializeGoal(goal: Goal): string {
  return [
    `[goal]`,
    `id = "${escape(goal.goal.id)}"`,
    serializeString("description", goal.goal.description),
    `status = "${escape(goal.goal.status)}"`,
    `created = "${goal.goal.created}"`,
    `queue_item_id = "${escape(goal.goal.queue_item_id)}"`
  ].join("\n")
}

export function createStore(beadsRoot: string) {
  async function ensureGoalDir(goalId: string): Promise<string> {
    const dir = join(beadsRoot, goalId)
    await mkdir(dir, { recursive: true })
    return dir
  }

  async function writeGoal(goal: Goal): Promise<void> {
    const dir = await ensureGoalDir(goal.goal.id)
    await Bun.write(join(dir, "goal.toml"), serializeGoal(goal))
  }

  async function writeBead(bead: Bead): Promise<void> {
    const dir = await ensureGoalDir(bead.bead.goal_id)
    await Bun.write(join(dir, `${bead.bead.id}.toml`), serializeBead(bead))
  }

  async function readGoals(): Promise<Goal[]> {
    const glob = new Bun.Glob("*/goal.toml")
    const goals: Goal[] = []
    for await (const file of glob.scan(beadsRoot)) {
      const text = await Bun.file(join(beadsRoot, file)).text()
      try {
        goals.push(TOML.parse(text) as Goal)
      } catch {
        console.error(`[conductor] failed to parse ${file}`)
      }
    }
    return goals
  }

  async function readBeads(goalId: string): Promise<Bead[]> {
    const dir = join(beadsRoot, goalId)
    const glob = new Bun.Glob("bead-*.toml")
    const beads: Bead[] = []
    for await (const file of glob.scan(dir)) {
      const text = await Bun.file(join(dir, file)).text()
      try {
        beads.push(TOML.parse(text) as Bead)
      } catch {
        console.error(`[conductor] failed to parse ${file}`)
      }
    }
    return beads
  }

  async function readAllBeads(): Promise<Bead[]> {
    const goals = await readGoals()
    const all: Bead[] = []
    for (const goal of goals) {
      const beads = await readBeads(goal.goal.id)
      all.push(...beads)
    }
    return all
  }

  async function readBead(beadId: string): Promise<Bead | undefined> {
    const glob = new Bun.Glob(`*/${beadId}.toml`)
    for await (const file of glob.scan(beadsRoot)) {
      const text = await Bun.file(join(beadsRoot, file)).text()
      try {
        return TOML.parse(text) as Bead
      } catch {
        return undefined
      }
    }
    return undefined
  }

  /** Find the most recent bead associated with a queue item ID */
  async function findBeadByQueueItemId(queueItemId: string): Promise<Bead | null> {
    const all = await readAllBeads()
    const matches = all
      .filter((b) => b.worker.queue_item_id === queueItemId)
      .sort((a, b) => b.bead.created.localeCompare(a.bead.created))
    return matches[0] ?? null
  }

  // ── Prompt files ────────────────────────────────────────────────────────────

  function promptPath(goalId: string, beadId: string): string {
    return join(beadsRoot, goalId, `prompt-${beadId}.md`)
  }

  function systemPromptPath(goalId: string, beadId: string): string {
    return join(beadsRoot, goalId, `sysprompt-${beadId}.md`)
  }

  async function writeBeadPrompt(goalId: string, beadId: string, prompt: string): Promise<void> {
    await ensureGoalDir(goalId)
    await Bun.write(promptPath(goalId, beadId), prompt)
  }

  async function writeBeadSystemPrompt(goalId: string, beadId: string, systemPrompt: string): Promise<void> {
    await ensureGoalDir(goalId)
    await Bun.write(systemPromptPath(goalId, beadId), systemPrompt)
  }

  async function readBeadPrompt(goalId: string, beadId: string): Promise<string | null> {
    const f = Bun.file(promptPath(goalId, beadId))
    return (await f.exists()) ? f.text() : null
  }

  async function readBeadSystemPrompt(goalId: string, beadId: string): Promise<string | null> {
    const f = Bun.file(systemPromptPath(goalId, beadId))
    return (await f.exists()) ? f.text() : null
  }

  // ── Event log ───────────────────────────────────────────────────────────────

  function eventsPath(goalId: string, beadId: string): string {
    return join(beadsRoot, goalId, `events-${beadId}.jsonl`)
  }

  interface EventCtx {
    queueItemId?: string
    project?: string
  }

  function appendEvent(goalId: string, beadId: string, event: BeadEvent, ctx?: EventCtx): void {
    // JSONL — keeps the WS stream reader working unchanged
    try {
      appendFileSync(eventsPath(goalId, beadId), JSON.stringify(event) + "\n")
    } catch (err) {
      console.error(`[conductor] failed to append event for ${beadId}:`, err)
    }

    // SQLite — persistent, queryable record
    try {
      insertEvent({
        ts: event.ts,
        goal_id: goalId,
        bead_id: beadId,
        queue_item_id: ctx?.queueItemId ?? "",
        project: ctx?.project ?? "",
        type: event.type,
        content: event.content,
        meta: event.meta !== undefined ? JSON.stringify(event.meta) : null
      })
    } catch (err) {
      console.error(`[conductor] failed to write event to db for ${beadId}:`, err)
    }
  }

  async function readEvents(
    goalId: string,
    beadId: string,
    fromLine = 0
  ): Promise<{ events: BeadEvent[]; totalLines: number }> {
    const path = eventsPath(goalId, beadId)
    if (!existsSync(path)) return { events: [], totalLines: 0 }

    try {
      const text = await Bun.file(path).text()
      const lines = text.split("\n").filter((l) => l.trim() !== "")
      const slice = lines.slice(fromLine)
      const events = slice
        .map((l) => {
          try {
            return JSON.parse(l) as BeadEvent
          } catch {
            return null
          }
        })
        .filter((e): e is BeadEvent => e !== null)
      return { events, totalLines: lines.length }
    } catch {
      return { events: [], totalLines: 0 }
    }
  }

  return {
    writeGoal,
    writeBead,
    readGoals,
    readBeads,
    readAllBeads,
    readBead,
    findBeadByQueueItemId,
    ensureGoalDir,
    appendEvent,
    readEvents,
    eventsPath,
    writeBeadPrompt,
    writeBeadSystemPrompt,
    readBeadPrompt,
    readBeadSystemPrompt
  }
}
