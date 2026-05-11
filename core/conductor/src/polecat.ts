import { randomUUID } from "crypto"
import type { Bead, BeadEvent } from "./types"
import { REVIEW_GATED_TYPES } from "./types"
import type { createStore } from "./store"
import { buildSystemPromptForBead, loadAgentConfig, CLAUDE_PATH, CONDUCTOR_ROOT } from "./prompt"
import { readProjectToml } from "./project"

const CONDUCTOR_MODE_INSTRUCTION = `
---

## Conductor Mode

You are operating non-interactively via the conductor. You must follow these constraints:

DO NOT run any git write commands:
  git commit, git push, git reset --hard, git checkout -b, git merge, git rebase,
  git stash, git tag, git branch -d, git rm, git mv

You MAY read git state: git status, git diff, git log, git show.

Your task is complete when all acceptance criteria are satisfied.
At the very end of your output, write a brief summary (3-5 sentences) of what you did,
what files you changed, and whether all acceptance criteria are met.
`.trim()

// ── Stream-JSON parsing ──────────────────────────────────────────────────────

function toolSummary(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "Read":
      return `Read  ${String(input["file_path"] ?? "")}`
    case "Write":
      return `Write ${String(input["file_path"] ?? "")}`
    case "Edit":
      return `Edit  ${String(input["file_path"] ?? "")}`
    case "Bash": {
      const cmd = String(input["command"] ?? "")
      return `Bash  ${cmd.length > 100 ? cmd.slice(0, 100) + "…" : cmd}`
    }
    case "Glob":
      return `Glob  ${String(input["pattern"] ?? "")}`
    case "Grep":
      return `Grep  "${String(input["pattern"] ?? "")}" in ${String(input["path"] ?? ".")}`
    default:
      return `${name}(${Object.keys(input).join(", ")})`
  }
}

function parseStreamLine(
  line: string,
  emit: (type: BeadEvent["type"], content: string, meta?: Record<string, unknown>) => void
): void {
  let msg: Record<string, unknown>
  try {
    msg = JSON.parse(line) as Record<string, unknown>
  } catch {
    if (line.trim()) emit("output", line)
    return
  }

  if (msg["type"] === "system" && msg["subtype"] === "init") {
    const tools = Array.isArray(msg["tools"]) ? (msg["tools"] as string[]).join(", ") : ""
    emit("status", `Session ready${tools ? ` · tools: ${tools}` : ""}`)
    return
  }

  if (msg["type"] === "assistant") {
    const message = msg["message"] as Record<string, unknown> | undefined
    const content = message?.["content"]
    if (!Array.isArray(content)) return
    for (const block of content as Record<string, unknown>[]) {
      if (block["type"] === "text") {
        const text = String(block["text"] ?? "").trim()
        if (text) emit("output", text)
      } else if (block["type"] === "tool_use") {
        const name = String(block["name"] ?? "Tool")
        const input = (block["input"] as Record<string, unknown>) ?? {}
        emit("tool_use", toolSummary(name, input), { tool: name, input })
      }
    }
    return
  }

  if (msg["type"] === "result") {
    const usage = msg["usage"] as Record<string, unknown> | undefined
    const cost = typeof msg["total_cost_usd"] === "number" ? msg["total_cost_usd"] : null
    const duration = typeof msg["duration_ms"] === "number" ? msg["duration_ms"] : null
    const inTok = Number(usage?.["input_tokens"] ?? 0)
    const outTok = Number(usage?.["output_tokens"] ?? 0)
    const cached = Number(usage?.["cache_read_input_tokens"] ?? 0)

    const summary = [
      `${inTok.toLocaleString()} in / ${outTok.toLocaleString()} out`,
      cached > 0 ? `${cached.toLocaleString()} cached` : null,
      cost !== null ? `$${cost.toFixed(4)}` : null,
      duration !== null ? `${(duration / 1000).toFixed(1)}s` : null
    ]
      .filter(Boolean)
      .join(" · ")

    emit("usage", summary, { usage, cost, duration_ms: duration })
    return
  }
}

// ── Prompt preparation ───────────────────────────────────────────────────────

function buildUserPrompt(bead: Bead): string {
  return [
    `Task: ${bead.bead.title}`,
    ``,
    `Description:\n${bead.task.description}`,
    ``,
    `Acceptance criteria:\n${bead.task.acceptance}`,
    bead.task.context_files.length > 0 ? `\nContext files to read first:\n${bead.task.context_files.join("\n")}` : ""
  ]
    .filter(Boolean)
    .join("\n")
}

export async function prepareBeadPrompt(bead: Bead, store: ReturnType<typeof createStore>): Promise<void> {
  const ctx = { queueItemId: bead.worker.queue_item_id, project: bead.worker.project }
  const emit = (type: BeadEvent["type"], content: string) => {
    store.appendEvent(
      bead.bead.goal_id,
      bead.bead.id,
      {
        ts: new Date().toISOString(),
        type,
        content
      },
      ctx
    )
  }

  try {
    const projectToml = bead.worker.project ? await readProjectToml(bead.worker.project) : null

    const [systemPrompt, agentConfig] = await Promise.all([
      buildSystemPromptForBead(bead.bead.role, bead.bead.goal_id, projectToml ?? undefined),
      loadAgentConfig(bead.bead.role)
    ])

    const fullSystemPrompt = systemPrompt + "\n\n" + CONDUCTOR_MODE_INSTRUCTION
    const prompt = buildUserPrompt(bead)

    await Promise.all([
      store.writeBeadPrompt(bead.bead.goal_id, bead.bead.id, prompt),
      store.writeBeadSystemPrompt(bead.bead.goal_id, bead.bead.id, fullSystemPrompt)
    ])

    emit("status", `prompt ready · model: ${agentConfig.model} · role: ${bead.bead.role}`)
  } catch (err) {
    emit("error", `Prompt preparation failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ── Bead execution ───────────────────────────────────────────────────────────

export async function executeBead(bead: Bead, store: ReturnType<typeof createStore>): Promise<void> {
  const sessionId = randomUUID()
  bead.bead.status = "in_progress"
  bead.bead.started = new Date().toISOString()
  bead.worker.session_id = sessionId
  await store.writeBead(bead)

  const ctx = { queueItemId: bead.worker.queue_item_id, project: bead.worker.project }
  const emit = (type: BeadEvent["type"], content: string, meta?: Record<string, unknown>) => {
    store.appendEvent(
      bead.bead.goal_id,
      bead.bead.id,
      {
        ts: new Date().toISOString(),
        type,
        content,
        meta
      },
      ctx
    )
  }

  emit("status", "in_progress")

  const cwd = bead.worker.cwd || CONDUCTOR_ROOT

  try {
    const [savedPrompt, savedSystemPrompt, agentConfig] = await Promise.all([
      store.readBeadPrompt(bead.bead.goal_id, bead.bead.id),
      store.readBeadSystemPrompt(bead.bead.goal_id, bead.bead.id),
      loadAgentConfig(bead.bead.role)
    ])

    // Fallback if prompt files are missing (e.g. conductor restart before prep completed)
    const prompt = savedPrompt ?? buildUserPrompt(bead)
    const systemPrompt = savedSystemPrompt ?? CONDUCTOR_MODE_INSTRUCTION

    emit("status", `starting in ${cwd}`)

    const proc = Bun.spawn(
      [
        CLAUDE_PATH,
        "-p",
        prompt,
        "--system-prompt",
        systemPrompt,
        "--model",
        agentConfig.model,
        "--allowedTools",
        agentConfig.tools.join(","),
        "--output-format",
        "stream-json"
      ],
      {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env }
      }
    )

    const decoder = new TextDecoder()
    let buffer = ""

    if (proc.stdout) {
      const reader = proc.stdout.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          parseStreamLine(line, emit)
        }
      }
      if (buffer.trim()) parseStreamLine(buffer, emit)
    }

    if (proc.stderr) {
      const errReader = proc.stderr.getReader()
      const errDecoder = new TextDecoder()
      while (true) {
        const { done, value } = await errReader.read()
        if (done) break
        const text = errDecoder.decode(value, { stream: true })
        if (text.trim()) emit("error", text.trim())
      }
    }

    const exitCode = await proc.exited

    if (exitCode === 0) {
      const needsReview = REVIEW_GATED_TYPES.has(bead.bead.item_type)
      bead.bead.status = needsReview ? "review_pending" : "completed"
      emit("status", bead.bead.status)
    } else {
      bead.bead.status = "failed"
      emit("status", `failed (exit ${exitCode})`)
    }
  } catch (err) {
    bead.bead.status = "failed"
    emit("error", err instanceof Error ? err.message : String(err))
    emit("status", "failed")
  }

  bead.bead.completed = new Date().toISOString()
  await store.writeBead(bead)
}
