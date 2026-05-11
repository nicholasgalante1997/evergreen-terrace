import { resolve, join } from "path"
import { config } from "@evergreen-terrace/common"

const CONTEXT_ROOT = process.env["QUEUE_ROOT"] ?? process.cwd()
const CLAUDE_PATH = process.env["CLAUDE_PATH"] ?? "claude"

interface AgentConfig {
  model: string
  tools: string[]
  skills: string[]
  steering: string[]
}

async function readText(path: string): Promise<string | null> {
  const f = Bun.file(path)
  return (await f.exists()) ? f.text() : null
}

async function buildSentinelPrompt(): Promise<{ systemPrompt: string; agentConfig: AgentConfig }> {
  const configText = await readText(join(CONTEXT_ROOT, "agents/momentum-sentinel/agent.json"))
  if (!configText) throw new Error("momentum-sentinel agent.json not found")
  const agentConfig = JSON.parse(configText) as AgentConfig

  const parts: string[] = []
  const agentMd = await readText(join(CONTEXT_ROOT, "agents/momentum-sentinel/AGENT.md"))
  if (agentMd) parts.push(agentMd.trim())

  for (const doc of agentConfig.steering) {
    const content = await readText(join(CONTEXT_ROOT, "steering", `${doc}.md`))
    if (content) parts.push(`---\n\n## Context: ${doc}\n\n${content.trim()}`)
  }

  return { systemPrompt: parts.join("\n\n"), agentConfig }
}

async function spawnAsync(cmd: string[]): Promise<{ exitCode: number; stdout: string }> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" })
  const exitCode = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  return { exitCode, stdout }
}

export async function runSentinel(): Promise<string> {
  const { systemPrompt, agentConfig } = await buildSentinelPrompt()

  const userPrompt = [
    "Run a full momentum sentinel report.",
    `Context root: ${CONTEXT_ROOT}`,
    "Read all project TOMLs from context/projects/, the queue inbox, and git logs for each project repo.",
    "Score each project and produce a ranked momentum report."
  ].join("\n")

  const result = await spawnAsync([
    CLAUDE_PATH,
    "-p",
    userPrompt,
    "--system-prompt",
    systemPrompt,
    "--model",
    agentConfig.model,
    "--allowedTools",
    agentConfig.tools.join(",")
  ])

  const report = result.stdout
  const date = new Date().toISOString().slice(0, 10)
  const reportsDir = resolve(CONTEXT_ROOT, "context/reports")
  await Bun.write(resolve(reportsDir, `sentinel-${date}.md`), report)

  // Fire-and-forget metrics notification — uses metrics port, not queue port
  const metricsUrl = `http://localhost:${config.metrics.server.port}/metrics/event`
  fetch(metricsUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "sentinel_run", date, success: result.exitCode === 0 })
  }).catch(() => {})

  // Update last_run in global.toml
  const tomlPath = resolve(CONTEXT_ROOT, "context/global.toml")
  const content = await Bun.file(tomlPath).text()
  const updated = content.replace(/last_run\s*=\s*".*?"/, `last_run = "${new Date().toISOString()}"`)
  await Bun.write(tomlPath, updated)

  return report
}
