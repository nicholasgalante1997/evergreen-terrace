/** @module Local recovery snapshots: command and read databases, the event topic, factory records, and `.et` history. */

import { createHash } from "node:crypto"
import { chmod, mkdir, readdir, stat } from "node:fs/promises"
import { basename, join, relative } from "node:path"
import type { CommandRunner, ManifestFile, SnapshotManifest, SnapshotRequest } from "./recovery.types"

export const databases = ["evergreen_command", "evergreen_read"] as const
export const eventTopic = "evergreen.events.v1"
const postgresContainer = "evergreen-postgres"
const kafkaContainer = "evergreen-kafka"
const kafkaBin = "/opt/kafka/bin"

/** `<UTC timestamp>-<reason>`; the reason is reduced to a safe path segment. */
export const snapshotName = (reason: string, now: Date): string => {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z")
  const slug =
    reason
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "manual"
  return `${stamp}-${slug}`
}

/** `kafka-get-offsets` prints `topic:partition:offset`; the end offsets sum to the message count. */
export const parseOffsets = (output: string): Record<string, number> =>
  Object.fromEntries(
    output
      .split("\n")
      .map((line) => line.trim().split(":"))
      .filter((parts) => parts.length === 3 && parts[2] !== undefined && /^\d+$/.test(parts[2]))
      .map(([, partition, offset]) => [String(partition), Number(offset)])
  )

export const sha256File = async (path: string): Promise<string> => {
  const hash = createHash("sha256")
  for await (const chunk of Bun.file(path).stream()) {
    hash.update(chunk)
  }
  return hash.digest("hex")
}

const listFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name !== "manifest.json")
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()
}

export const manifestFiles = async (directory: string): Promise<ManifestFile[]> =>
  Promise.all(
    (await listFiles(directory)).map(async (path) => ({
      bytes: (await stat(path)).size,
      path: relative(directory, path),
      sha256: await sha256File(path)
    }))
  )

/**
 * Takes one snapshot. Nothing here is destructive: databases are read with
 * `pg_dump` (no role password hashes), the topic is read by a throwaway
 * consumer with no group, and files are only archived. A missing source is
 * recorded as skipped rather than failing the whole snapshot; a source that
 * exists but cannot be read fails it, so a partial snapshot is never mistaken
 * for a whole one.
 */
export const takeSnapshot = async (
  runner: CommandRunner,
  request: SnapshotRequest,
  now = new Date()
): Promise<{ directory: string; manifest: SnapshotManifest }> => {
  const directory = join(request.backupRoot, snapshotName(request.reason, now))
  await mkdir(directory, { mode: 0o700, recursive: true })
  await chmod(directory, 0o700)
  try {
    return await capture(runner, request, directory, now)
  } catch (error) {
    // A failed snapshot is kept for diagnosis but can never pass verification.
    await Bun.write(join(directory, "INCOMPLETE.txt"), `${error instanceof Error ? error.message : String(error)}\n`)
    throw error
  }
}

const capture = async (
  runner: CommandRunner,
  request: SnapshotRequest,
  directory: string,
  now: Date
): Promise<{ directory: string; manifest: SnapshotManifest }> => {
  const skipped: string[] = []
  const must = async (argv: readonly string[], options: { cwd?: string; stdoutPath?: string } = {}) => {
    const result = await runner.run(argv, options)
    if (result.exitCode !== 0) {
      throw new Error(`${argv.slice(0, 4).join(" ")} failed (${result.exitCode}): ${result.stderr.trim().slice(0, 500)}`)
    }
    return result
  }

  await mkdir(join(directory, "postgres"), { recursive: true })
  for (const database of databases) {
    await must(["docker", "exec", postgresContainer, "pg_dump", "-U", "evergreen_admin", "--format=custom", database], {
      stdoutPath: join(directory, "postgres", `${database}.dump`)
    })
  }

  await mkdir(join(directory, "kafka"), { recursive: true })
  const offsets = parseOffsets(
    (
      await must([
        "docker",
        "exec",
        kafkaContainer,
        `${kafkaBin}/kafka-get-offsets.sh`,
        "--bootstrap-server",
        "kafka:9092",
        "--topic",
        eventTopic
      ])
    ).stdout
  )
  const total = Object.values(offsets).reduce((sum, offset) => sum + offset, 0)
  const exportPath = join(directory, "kafka", `${eventTopic}.ndjson`)
  if (total > 0) {
    await must(
      [
        "docker",
        "exec",
        kafkaContainer,
        `${kafkaBin}/kafka-console-consumer.sh`,
        "--bootstrap-server",
        "kafka:9092",
        "--topic",
        eventTopic,
        "--from-beginning",
        "--max-messages",
        String(total),
        "--timeout-ms",
        "30000",
        "--formatter-property",
        "print.partition=true",
        "--formatter-property",
        "print.offset=true",
        "--formatter-property",
        "print.key=true"
      ],
      { stdoutPath: exportPath }
    )
  } else {
    await Bun.write(exportPath, "")
  }
  // Count message lines only: the consumer may print notices to stdout too.
  const exported = (await Bun.file(exportPath).text()).split("\n").filter((line) => line.startsWith("Partition:")).length
  if (exported !== total) {
    throw new Error(`Exported ${exported} of ${total} ${eventTopic} messages; the topic export is incomplete`)
  }

  if (request.factoryRoot !== null) {
    const archived = ["records", "handoffs", "jarvis", ...(request.includeArtifacts ? ["artifacts"] : [])]
    const present = []
    for (const name of archived) {
      if (
        await stat(join(request.factoryRoot, name)).then(
          () => true,
          () => false
        )
      ) {
        present.push(name)
      } else {
        skipped.push(`factory/${name} (absent)`)
      }
    }
    if (!request.includeArtifacts) {
      skipped.push("factory/artifacts (pass --artifacts to include)")
    }
    if (present.length > 0) {
      await mkdir(join(directory, "factory"), { recursive: true })
      await must([
        "tar",
        "--create",
        "--gzip",
        "--file",
        join(directory, "factory", "factory.tar.gz"),
        "--directory",
        request.factoryRoot,
        ...present
      ])
    }
  }

  if (request.projectRoots.length > 0) {
    await mkdir(join(directory, "et-history"), { recursive: true })
  }
  for (const [index, projectRoot] of request.projectRoots.entries()) {
    await must(["git", "log", "--format=commit %H%nDate: %cI%n%n    %s%n", "--patch", "--", ".et"], {
      cwd: projectRoot,
      stdoutPath: join(directory, "et-history", `${index + 1}-${basename(projectRoot)}.patch`)
    })
  }

  const manifest: SnapshotManifest = {
    createdAt: now.toISOString(),
    files: await manifestFiles(directory),
    kafka: { exported, offsets, topic: eventTopic },
    reason: request.reason,
    skipped,
    version: 1
  }
  for (const file of manifest.files) {
    await chmod(join(directory, file.path), 0o600)
  }
  await Bun.write(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  await chmod(join(directory, "manifest.json"), 0o600)
  return { directory, manifest }
}

/** Re-hashes every file and reports any that are missing, changed, or not in the manifest. */
export const verifySnapshot = async (directory: string): Promise<string[]> => {
  const manifest = (await Bun.file(join(directory, "manifest.json")).json()) as SnapshotManifest
  const actual = new Map((await manifestFiles(directory)).map((file) => [file.path, file]))
  const problems = manifest.files.flatMap((file) => {
    const found = actual.get(file.path)
    return found === undefined ? [`missing: ${file.path}`] : found.sha256 !== file.sha256 ? [`changed: ${file.path}`] : []
  })
  const listed = new Set(manifest.files.map((file) => file.path))
  return [...problems, ...[...actual.keys()].filter((path) => !listed.has(path)).map((path) => `unlisted: ${path}`)]
}
