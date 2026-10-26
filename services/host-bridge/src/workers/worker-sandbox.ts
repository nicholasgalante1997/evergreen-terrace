/** @module Bubblewrap argv construction for ACP worker write isolation. */

import { mkdir } from "node:fs/promises"
import { tryProcess } from "../process/run-process"
import type { AcpAdapter } from "./acp-runner.types"
import { prepareCodexWorkerHome } from "./codex-worker-home"

const existingPath = async (path: string): Promise<boolean> => Bun.file(path).exists()

/** The repository's shared Git directory, which a linked worktree's `.git` file points into. */
const gitCommonDirectory = async (worktreePath: string): Promise<string | null> => {
  const resolved = await tryProcess(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], worktreePath)
  return resolved.exitCode === 0 && resolved.stdout.trim().length > 0 ? resolved.stdout.trim() : null
}

export const workerSandboxCommand = async (
  adapter: AcpAdapter,
  command: string,
  worktreePath: string,
  artifactDirectory: string,
  options: { readOnly: boolean } = { readOnly: false }
): Promise<string[]> => {
  const home = process.env["HOME"]
  const codexHome = adapter === "codex" ? await prepareCodexWorkerHome(artifactDirectory) : undefined
  const temporaryDirectory = `${artifactDirectory}/sandbox-tmp`
  await mkdir(temporaryDirectory, { recursive: true })
  const commonDirectory = await gitCommonDirectory(worktreePath)
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
    // Git metadata stays read-only for every session (the host makes all factory commits), and is
    // re-exposed here so a repository under /tmp is not hidden by the private /tmp above.
    ...(commonDirectory === null ? [] : ["--ro-bind", commonDirectory, commonDirectory]),
    options.readOnly ? "--ro-bind" : "--bind",
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
