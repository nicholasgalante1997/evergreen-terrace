/** @module Bubblewrap argv construction for ACP worker write isolation. */

import { mkdir } from "node:fs/promises"
import type { AcpAdapter } from "./acp-runner.types"
import { prepareCodexWorkerHome } from "./codex-worker-home"

const existingPath = async (path: string): Promise<boolean> => Bun.file(path).exists()

export const workerSandboxCommand = async (
  adapter: AcpAdapter,
  command: string,
  worktreePath: string,
  artifactDirectory: string
): Promise<string[]> => {
  const home = process.env["HOME"]
  const codexHome = adapter === "codex" ? await prepareCodexWorkerHome(artifactDirectory) : undefined
  const temporaryDirectory = `${artifactDirectory}/sandbox-tmp`
  await mkdir(temporaryDirectory, { recursive: true })
  const argumentsValue = [
    "--die-with-parent",
    "--new-session",
    "--ro-bind",
    "/",
    "/",
    "--dev",
    "/dev",
    // Mounts apply in order: /tmp first, so a worktree or artifact root under /tmp is not shadowed.
    "--bind",
    temporaryDirectory,
    "/tmp",
    "--bind",
    worktreePath,
    worktreePath,
    "--bind",
    artifactDirectory,
    artifactDirectory,
    "--chdir",
    worktreePath
  ]
  if (home !== undefined) {
    for (const relativePath of adapter === "codex" ? [".claude"] : [".claude", ".codex"]) {
      const path = `${home}/${relativePath}`
      if (await existingPath(path)) {
        argumentsValue.push("--bind", path, path)
      }
    }
    if (codexHome !== undefined && (await existingPath(`${home}/.codex/auth.json`))) {
      argumentsValue.push("--ro-bind", `${home}/.codex/auth.json`, `${codexHome}/auth.json`)
    }
  }

  return ["bwrap", ...argumentsValue, command]
}
