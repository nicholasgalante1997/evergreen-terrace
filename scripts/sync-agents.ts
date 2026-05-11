import { join } from "path";
import { mkdir, readdir } from "fs/promises";

interface AgentConfig {
  name: string;
  description: string;
  model: string;
  tools: string[];
  skills: string[];
  steering: string[];
}

const REPO_ROOT = process.env["REPO_ROOT"] ?? process.cwd();
const AGENTS_DIR = join(REPO_ROOT, "agents");
const SKILLS_DIR = join(REPO_ROOT, "skills");
const STEERING_DIR = join(REPO_ROOT, "steering");
const CLAUDE_AGENTS_DIR = join(process.env["HOME"] ?? "/root", ".claude", "agents");

async function readText(path: string): Promise<string | null> {
  const f = Bun.file(path);
  return (await f.exists()) ? f.text() : null;
}

async function buildSystemPrompt(role: string, config: AgentConfig): Promise<string> {
  const parts: string[] = [];

  const agentMd = await readText(join(AGENTS_DIR, role, "AGENT.md"));
  if (agentMd) parts.push(agentMd.trim());

  for (const skill of config.skills) {
    const content = await readText(join(SKILLS_DIR, skill, "SKILL.md"));
    if (content) {
      parts.push(`---\n\n## Skill: ${skill}\n\n${content.trim()}`);
    } else {
      console.warn(`[sync-agents] skill not found: ${skill}`);
    }
  }

  for (const doc of config.steering) {
    const content = await readText(join(STEERING_DIR, `${doc}.md`));
    if (content) {
      parts.push(`---\n\n## Context: ${doc}\n\n${content.trim()}`);
    } else {
      console.warn(`[sync-agents] steering doc not found: ${doc}`);
    }
  }

  return parts.join("\n\n");
}

function buildFrontmatter(config: AgentConfig): string {
  const toolsList = config.tools.join(", ");
  const escapedDesc = config.description.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return [
    "---",
    `name: ${config.name}`,
    `description: "${escapedDesc}"`,
    `model: ${config.model}`,
    `tools: [${toolsList}]`,
    "permissionMode: default",
    "---",
  ].join("\n");
}

async function syncAgents(): Promise<void> {
  await mkdir(CLAUDE_AGENTS_DIR, { recursive: true });

  let entries: string[];
  try {
    entries = await readdir(AGENTS_DIR);
  } catch {
    console.error(`[sync-agents] agents dir not found: ${AGENTS_DIR}`);
    process.exit(1);
  }

  let synced = 0;
  let skipped = 0;

  for (const role of entries) {
    const configText = await readText(join(AGENTS_DIR, role, "agent.json"));
    if (!configText) {
      skipped++;
      continue;
    }

    let config: AgentConfig;
    try {
      config = JSON.parse(configText) as AgentConfig;
    } catch {
      console.error(`[sync-agents] failed to parse ${role}/agent.json`);
      skipped++;
      continue;
    }

    const systemPrompt = await buildSystemPrompt(role, config);
    const output = `${buildFrontmatter(config)}\n\n${systemPrompt}\n`;
    await Bun.write(join(CLAUDE_AGENTS_DIR, `${role}.md`), output);
    synced++;
  }

  console.log(
    `[sync-agents] synced ${synced} agents → ${CLAUDE_AGENTS_DIR}` +
      (skipped > 0 ? ` (${skipped} skipped)` : ""),
  );
}

await syncAgents();
