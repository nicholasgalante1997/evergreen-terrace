import { join } from "path"
import { parse } from "toml"

const CONDUCTOR_ROOT = process.env["CONDUCTOR_ROOT"] ?? process.cwd()

interface ProjectToml {
  project: {
    name: string
    repo: string
  }
}

/**
 * Resolves the filesystem repo path for a project from its context TOML.
 * Returns null if the project TOML is missing or has no repo field.
 *
 * This is the authoritative source for the working directory passed to claude -p.
 * If this returns null, the conductor cannot run the agent in the correct directory
 * and will log a warning. The caller should fall back to the evergreen-terrace root
 * but surface the misconfiguration clearly.
 */
export async function resolveProjectDir(projectName: string): Promise<string | null> {
  const tomlPath = join(CONDUCTOR_ROOT, "context/projects", `${projectName}.toml`)
  const file = Bun.file(tomlPath)

  if (!(await file.exists())) {
    console.warn(`[conductor] project TOML not found: ${tomlPath}`)
    return null
  }

  try {
    const text = await file.text()
    const parsed = parse(text) as ProjectToml
    const repo = parsed?.project?.repo

    if (!repo || repo.trim() === "") {
      console.warn(`[conductor] project TOML has no repo field: ${tomlPath}`)
      return null
    }

    return repo.trim()
  } catch (err) {
    console.warn(`[conductor] failed to parse project TOML ${tomlPath}:`, err)
    return null
  }
}

/**
 * Reads the raw project TOML as a string for injection into agent system prompts.
 * Returns null if file is missing or unreadable.
 */
export async function readProjectToml(projectName: string): Promise<string | null> {
  const tomlPath = join(CONDUCTOR_ROOT, "context/projects", `${projectName}.toml`)
  const file = Bun.file(tomlPath)
  if (!(await file.exists())) return null
  try {
    return await file.text()
  } catch {
    return null
  }
}
