/** @module Safe argv-based host-process execution. */

import type { ProcessOutcome, ProcessResult } from "./process-result.types"

/** Runs a command and reports its exit status without throwing on failure. */
export const tryProcess = async (command: ReadonlyArray<string>, cwd: string): Promise<ProcessOutcome> => {
  const process = Bun.spawn([...command], { cwd, stderr: "pipe", stdout: "pipe" })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text()
  ])
  return { exitCode, stderr, stdout }
}

export const runProcess = async (command: ReadonlyArray<string>, cwd: string): Promise<ProcessResult> => {
  const { exitCode, stderr, stdout } = await tryProcess(command, cwd)
  if (exitCode !== 0) {
    throw new Error(`Host command failed (${command[0] ?? "unknown"}): ${stderr.trim()}`)
  }

  return { stderr, stdout }
}
