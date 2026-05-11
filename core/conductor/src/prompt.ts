import { join } from "path"

export const CLAUDE_PATH = process.env["CLAUDE_PATH"] ?? "claude"
export const CONDUCTOR_ROOT = process.env["CONDUCTOR_ROOT"] ?? process.cwd()

interface AgentConfig {
  name: string
  description: string
  model: string
  tools: string[]
  skills: string[]
  steering: string[]
}

async function readText(path: string): Promise<string | null> {
  const f = Bun.file(path)
  return (await f.exists()) ? f.text() : null
}

export async function loadAgentConfig(role: string): Promise<AgentConfig> {
  const path = join(CONDUCTOR_ROOT, "agents", role, "agent.json")
  const text = await readText(path)
  if (!text) throw new Error(`agent config not found: ${path}`)
  return JSON.parse(text) as AgentConfig
}

export async function buildSystemPrompt(role: string): Promise<string> {
  const config = await loadAgentConfig(role)
  const parts: string[] = []

  const agentMd = await readText(join(CONDUCTOR_ROOT, "agents", role, "AGENT.md"))
  if (agentMd) parts.push(agentMd.trim())

  for (const skill of config.skills) {
    const content = await readText(join(CONDUCTOR_ROOT, "skills", skill, "SKILL.md"))
    if (content) {
      parts.push(`---\n\n## Skill: ${skill}\n\n${content.trim()}`)
    } else {
      console.warn(`[conductor] skill not found: ${skill}`)
    }
  }

  for (const doc of config.steering) {
    const content = await readText(join(CONDUCTOR_ROOT, "steering", `${doc}.md`))
    if (content) {
      parts.push(`---\n\n## Context: ${doc}\n\n${content.trim()}`)
    } else {
      console.warn(`[conductor] steering doc not found: ${doc}`)
    }
  }

  return parts.join("\n\n")
}

/**
 * Builds the full system prompt for a bead execution.
 * Injects the project context TOML so the agent knows the project's architecture.
 * The goalId is used to find the associated bead's project (via the bead store),
 * but callers can also pass projectToml directly if they have it.
 */
export async function buildSystemPromptForBead(role: string, _goalId: string, projectToml?: string): Promise<string> {
  const base = await buildSystemPrompt(role)
  if (!projectToml) return base

  return (
    base +
    `\n\n---\n\n## Project Context\n\nThe following is the project's context TOML. ` +
    `Use it to understand the project's current state, phase, and architecture.\n\n` +
    `\`\`\`toml\n${projectToml}\n\`\`\``
  )
}
