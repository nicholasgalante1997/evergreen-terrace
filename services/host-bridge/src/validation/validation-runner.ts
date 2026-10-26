/** @module Sandboxed, time-bounded runner for `.et` validation commands. */

import { mkdir } from "node:fs/promises"
import type { ValidationCommandResult } from "@evergreen-terrace/contracts"
import { validationEnvironment, validationSandboxCommand } from "./validation-sandbox"
import type { ValidationCommandRunner, ValidationPhase, ValidationRun, ValidationRunResult } from "./validation.types"

export class ValidationRunner implements ValidationCommandRunner {
  constructor(private readonly cacheDirectory: string) {}

  /**
   * Runs every setup command, stopping at the first failure, then every check
   * command so a failing run still carries complete evidence.
   */
  async run(input: ValidationRun): Promise<ValidationRunResult> {
    const startedAt = new Date().toISOString()
    const temporaryDirectory = `${input.artifactDirectory}/sandbox-tmp`
    await Promise.all([
      mkdir(temporaryDirectory, { recursive: true }),
      mkdir(`${this.cacheDirectory}/bun`, { recursive: true })
    ])
    const results: ValidationCommandResult[] = []
    const commands = [
      ...input.plan.setup.map((command) => ({ command, phase: "setup" as const })),
      ...input.plan.checks.map((command) => ({ command, phase: "check" as const }))
    ]
    for (const [index, { command, phase }] of commands.entries()) {
      const result = await this.runOne(input, command, phase, index + 1, temporaryDirectory)
      results.push(result)
      if (phase === "setup" && (result.exitCode !== 0 || result.timedOut)) {
        break
      }
    }
    const passed =
      results.length === commands.length && results.every((result) => result.exitCode === 0 && !result.timedOut)
    return { completedAt: new Date().toISOString(), results, startedAt, status: passed ? "passed" : "failed" }
  }

  private async runOne(
    input: ValidationRun,
    command: string,
    phase: ValidationPhase,
    index: number,
    temporaryDirectory: string
  ): Promise<ValidationCommandResult> {
    const stdoutPath = `${input.artifactDirectory}/${String(index).padStart(2, "0")}-${phase}.stdout.log`
    const stderrPath = `${input.artifactDirectory}/${String(index).padStart(2, "0")}-${phase}.stderr.log`
    const started = performance.now()
    const child = Bun.spawn(
      validationSandboxCommand({
        cacheDirectory: this.cacheDirectory,
        command,
        phase,
        temporaryDirectory,
        worktreePath: input.worktreePath
      }),
      {
        env: validationEnvironment(this.cacheDirectory),
        stderr: Bun.file(stderrPath),
        stdin: "ignore",
        stdout: Bun.file(stdoutPath)
      }
    )
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, input.plan.timeoutSeconds * 1_000)
    const exitCode = await child.exited
    clearTimeout(timer)
    return {
      command,
      durationMs: Math.round(performance.now() - started),
      exitCode: timedOut ? null : exitCode,
      phase,
      stderrPath,
      stdoutPath,
      timedOut
    }
  }
}
