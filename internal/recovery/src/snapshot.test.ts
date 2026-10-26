/** @module Recovery-snapshot tests with a scripted command runner and real files. */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CommandRunner } from "./recovery.types"
import { parseOffsets, snapshotName, takeSnapshot, verifySnapshot } from "./snapshot"

/** Pretends to be docker, tar, and git: writes deterministic output where real tools would. */
const fakeRunner = (calls: string[][], options: { exported?: number; failDump?: boolean } = {}): CommandRunner => ({
  run: async (argv, runOptions = {}) => {
    calls.push([...argv])
    const write = async (text: string) =>
      runOptions.stdoutPath === undefined ? text : (await Bun.write(runOptions.stdoutPath, text), "")
    if (argv.includes("pg_dump")) {
      return options.failDump
        ? { exitCode: 1, stderr: "connection refused", stdout: "" }
        : { exitCode: 0, stderr: "", stdout: await write("PGDMP") }
    }
    if (argv.some((part) => part.endsWith("kafka-get-offsets.sh"))) {
      return { exitCode: 0, stderr: "", stdout: "evergreen.events.v1:0:2\nevergreen.events.v1:1:1\n" }
    }
    if (argv.some((part) => part.endsWith("kafka-console-consumer.sh"))) {
      const lines = Array.from(
        { length: options.exported ?? 3 },
        (_, index) => `Partition:0\tOffset:${index}\tkey\t{"eventId":"${index}"}`
      )
      const notice = "Option --property is deprecated and will be removed in a future version."
      return { exitCode: 0, stderr: "", stdout: await write(`${notice}\n${lines.join("\n")}\n`) }
    }
    if (argv[0] === "tar") {
      const file = argv[argv.indexOf("--file") + 1] ?? ""
      await Bun.write(file, "tarball")
      return { exitCode: 0, stderr: "", stdout: "" }
    }
    return { exitCode: 0, stderr: "", stdout: await write("commit abc\n") }
  }
})

describe("recovery snapshots", () => {
  let root = ""
  let factoryRoot = ""

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "et-recovery-"))
    factoryRoot = join(root, "factory")
    await mkdir(join(factoryRoot, "records"), { recursive: true })
    await writeFile(join(factoryRoot, "records", "manifest.json"), "{}")
  })

  afterAll(async () => {
    await rm(root, { force: true, recursive: true })
  })

  const request = (backupRoot: string) => ({
    backupRoot,
    factoryRoot,
    includeArtifacts: false,
    projectRoots: [root],
    reason: "Pre Upgrade!"
  })

  test("names snapshots by UTC time and a safe reason", () => {
    expect(snapshotName("Pre Upgrade!", new Date("2026-10-26T09:20:01.123Z"))).toBe("20261026T092001Z-pre-upgrade")
    expect(snapshotName("../../etc", new Date("2026-10-26T09:20:01Z"))).toBe("20261026T092001Z-etc")
  })

  test("sums partition end offsets", () => {
    expect(parseOffsets("evergreen.events.v1:0:5\nevergreen.events.v1:3:7\nnoise\n")).toEqual({ "0": 5, "3": 7 })
  })

  test("captures every source with a verifiable manifest and private permissions", async () => {
    const calls: string[][] = []
    const { directory, manifest } = await takeSnapshot(
      fakeRunner(calls),
      request(join(root, "backups-a")),
      new Date("2026-10-26T09:20:01Z")
    )
    expect(manifest.files.map((file) => file.path)).toEqual([
      "et-history/1-" + root.split("/").at(-1) + ".patch",
      "factory/factory.tar.gz",
      "kafka/evergreen.events.v1.ndjson",
      "postgres/evergreen_command.dump",
      "postgres/evergreen_read.dump"
    ])
    expect(manifest.kafka).toEqual({ exported: 3, offsets: { "0": 2, "1": 1 }, topic: "evergreen.events.v1" })
    expect(manifest.skipped).toContain("factory/handoffs (absent)")
    expect(calls.find((call) => call[0] === "tar")).toContain("records")
    expect(calls.flat()).not.toContain("pg_dumpall")
    expect((await stat(directory)).mode & 0o777).toBe(0o700)
    expect((await stat(join(directory, "postgres", "evergreen_command.dump"))).mode & 0o777).toBe(0o600)
    expect(await verifySnapshot(directory)).toEqual([])

    await writeFile(join(directory, "postgres", "evergreen_read.dump"), "tampered")
    await writeFile(join(directory, "extra.txt"), "x")
    expect(await verifySnapshot(directory)).toEqual(["changed: postgres/evergreen_read.dump", "unlisted: extra.txt"])
  })

  test("fails rather than recording an incomplete topic export or an unreadable database", async () => {
    await expect(takeSnapshot(fakeRunner([], { exported: 2 }), request(join(root, "backups-b")))).rejects.toThrow(
      /Exported 2 of 3/
    )
    await expect(takeSnapshot(fakeRunner([], { failDump: true }), request(join(root, "backups-c")))).rejects.toThrow(
      /connection refused/
    )
    const [failed] = await Array.fromAsync(new Bun.Glob("*/INCOMPLETE.txt").scan(join(root, "backups-c")))
    expect(await Bun.file(join(root, "backups-c", failed ?? "")).text()).toContain("connection refused")
  })
})
