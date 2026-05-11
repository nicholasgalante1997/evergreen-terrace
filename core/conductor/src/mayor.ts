import { randomUUID } from "crypto"
import type { Bead, Goal, WorkerRole } from "./types"
import type { createStore } from "./store"
import { buildSystemPrompt, loadAgentConfig, CLAUDE_PATH } from "./prompt"

interface ParsedTask {
  title: string
  role: WorkerRole
  description: string
  acceptance: string
  context_files: string[]
  output_files: string[]
}

async function spawnAsync(cmd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn([cmd, ...args], {
    stdout: "pipe",
    stderr: "pipe"
  })
  return new Response(proc.stdout).text()
}

function parseBreakdown(output: string): ParsedTask[] {
  const tasks: ParsedTask[] = []
  const blocks = output.split(/---\s*\n/)
  for (const block of blocks) {
    const titleMatch = block.match(/^title:\s*(.+)$/m)
    const roleMatch = block.match(/^role:\s*(.+)$/m)
    const descMatch = block.match(/^description:\s*(.+)$/m)
    const acceptMatch = block.match(/^acceptance:\s*(.+)$/m)
    const contextMatch = block.match(/^context_files:\s*(.+)$/m)
    const outputMatch = block.match(/^output_files:\s*(.+)$/m)
    if (titleMatch && roleMatch && descMatch) {
      tasks.push({
        title: titleMatch[1]!.trim(),
        role: (roleMatch[1]!.trim() as WorkerRole) || "eng-mid",
        description: descMatch[1]!.trim(),
        acceptance: acceptMatch?.[1]?.trim() ?? "",
        context_files:
          contextMatch?.[1]
            ?.split(",")
            .map((s) => s.trim())
            .filter(Boolean) ?? [],
        output_files:
          outputMatch?.[1]
            ?.split(",")
            .map((s) => s.trim())
            .filter(Boolean) ?? []
      })
    }
  }
  return tasks
}

export async function decomposeGoal(description: string, store: ReturnType<typeof createStore>): Promise<Goal> {
  const goalId = `goal-${randomUUID().slice(0, 8)}`
  const goal: Goal = {
    goal: {
      id: goalId,
      description,
      status: "in_progress",
      created: new Date().toISOString(),
      queue_item_id: "" // decomposition path — no originating queue item
    }
  }
  await store.writeGoal(goal)

  const userPrompt = `Break this goal into atomic tasks. For each task output a block separated by --- with fields: title, role (eng-senior|eng-mid|eng-junior|design|qa), description, acceptance, context_files (comma-separated), output_files (comma-separated).\n\nGoal: ${description}`

  let output: string
  try {
    const [systemPrompt, agentConfig] = await Promise.all([
      buildSystemPrompt("eng-senior"),
      loadAgentConfig("eng-senior")
    ])
    output = await spawnAsync(CLAUDE_PATH, [
      "-p",
      userPrompt,
      "--system-prompt",
      systemPrompt,
      "--model",
      agentConfig.model,
      "--allowedTools",
      agentConfig.tools.join(",")
    ])
  } catch {
    goal.goal.status = "failed"
    await store.writeGoal(goal)
    return goal
  }

  const tasks = parseBreakdown(output)
  if (tasks.length === 0) {
    goal.goal.status = "failed"
    await store.writeGoal(goal)
    return goal
  }

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!
    const bead: Bead = {
      bead: {
        id: `bead-${goalId.slice(5)}-${String(i + 1).padStart(3, "0")}`,
        goal_id: goalId,
        title: task.title,
        role: task.role,
        status: "pending",
        item_type: "feature", // decomposition path defaults to feature
        created: new Date().toISOString(),
        started: "",
        completed: ""
      },
      task: {
        description: task.description,
        acceptance: task.acceptance,
        context_files: task.context_files,
        output_files: task.output_files
      },
      worker: {
        session_id: "",
        cwd: "", // decomposition path — no specific project dir
        project: "", // decomposition path — no specific project
        queue_item_id: "" // decomposition path — no originating queue item
      }
    }
    await store.writeBead(bead)
  }

  return goal
}
