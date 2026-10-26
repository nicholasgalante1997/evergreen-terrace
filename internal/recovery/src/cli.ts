/** @module `factory:snapshot` entry point: take, verify, or list local recovery snapshots. */

import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { readdir } from "node:fs/promises"
import type { CommandRunner } from "./recovery.types"
import { databases, takeSnapshot, verifySnapshot } from "./snapshot"

const setting = (name: string): string | undefined => {
  const value = process.env[name]?.trim()
  return value === undefined || value.length === 0 ? undefined : value
}

const stateRoot = setting("XDG_STATE_HOME") ?? join(homedir(), ".local", "state")
const backupRoot = setting("ET_BACKUP_ROOT") ?? join(stateRoot, "evergreen-terrace", "backups")
const factoryRoot = setting("ET_FACTORY_ROOT") ?? join(stateRoot, "evergreen-terrace")

const runner: CommandRunner = {
  run: async (argv, options = {}) => {
    const child = Bun.spawn([...argv], {
      cwd: options.cwd ?? process.cwd(),
      stderr: "pipe",
      stdout: options.stdoutPath === undefined ? "pipe" : Bun.file(options.stdoutPath)
    })
    const [exitCode, stderr, stdout] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
      options.stdoutPath === undefined ? new Response(child.stdout as ReadableStream).text() : Promise.resolve("")
    ])
    return { exitCode, stderr, stdout }
  }
}

const option = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

const [command = "help", target] = process.argv.slice(2)

if (command === "snapshot") {
  if (process.argv.includes("--if-running")) {
    const running = await runner.run(["docker", "inspect", "--format", "{{.State.Running}}", "evergreen-postgres"])
    if (running.stdout.trim() !== "true") {
      console.error("evergreen-postgres is not running; nothing to snapshot.")
      process.exit(0)
    }
  }
  const projectRoots = process.argv.flatMap((value, index) =>
    process.argv[index - 1] === "--project-root" ? [resolve(value)] : []
  )
  if (!isAbsolute(factoryRoot)) {
    throw new Error(`ET_FACTORY_ROOT must be an absolute path: ${factoryRoot}`)
  }
  const { directory, manifest } = await takeSnapshot(runner, {
    backupRoot,
    factoryRoot,
    includeArtifacts: process.argv.includes("--artifacts"),
    projectRoots: projectRoots.length === 0 ? [process.cwd()] : projectRoots,
    reason: option("--reason") ?? "manual"
  })
  console.log(
    JSON.stringify(
      {
        directory,
        files: manifest.files.length,
        kafkaMessages: manifest.kafka?.exported ?? 0,
        skipped: manifest.skipped
      },
      null,
      2
    )
  )
} else if (command === "verify" && target !== undefined) {
  const problems = await verifySnapshot(resolve(target))
  for (const database of databases) {
    const listed = await runner.run([
      "sh",
      "-c",
      `docker exec -i evergreen-postgres pg_restore --list < "$1" > /dev/null`,
      "sh",
      join(resolve(target), "postgres", `${database}.dump`)
    ])
    if (listed.exitCode !== 0) {
      problems.push(`unreadable dump: ${database} (${listed.stderr.trim().slice(0, 200)})`)
    }
  }
  console.log(problems.length === 0 ? `ok: ${target}` : problems.join("\n"))
  process.exit(problems.length === 0 ? 0 : 1)
} else if (command === "list") {
  const names = await readdir(backupRoot).catch(() => [])
  console.log(names.sort().join("\n"))
} else {
  console.log(
    "usage: factory:snapshot snapshot [--reason <why>] [--project-root <dir>]... [--artifacts] [--if-running]\n       factory:snapshot verify <snapshot-directory>\n       factory:snapshot list"
  )
}
