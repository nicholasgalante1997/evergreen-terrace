/** @module ACP worker-sandbox construction tests. */

import { mkdtemp } from "node:fs/promises"
import { expect, test } from "bun:test"
import { workerSandboxCommand } from "./worker-sandbox"

test("gives a Codex worker private temporary and runtime-home mounts", async () => {
  const artifactDirectory = await mkdtemp("/tmp/et-worker-sandbox-")
  const command = await workerSandboxCommand("codex", "codex-acp", process.cwd(), artifactDirectory)

  expect(command).toEqual(
    expect.arrayContaining([
      "--dev",
      "/dev",
      "--bind",
      `${artifactDirectory}/sandbox-tmp`,
      "/tmp",
      "--ro-bind",
      `${artifactDirectory}/codex-home/auth.json`,
      "codex-acp"
    ])
  )
  expect(await Bun.file(`${artifactDirectory}/codex-home/auth.json`).exists()).toBe(true)
})

test("mounts the private /tmp before worktree and artifact binds so /tmp-rooted paths stay visible", async () => {
  const artifactDirectory = await mkdtemp("/tmp/et-worker-sandbox-order-")
  const worktreePath = await mkdtemp("/tmp/et-worker-sandbox-worktree-")
  const command = await workerSandboxCommand("claude", "claude-agent-acp", worktreePath, artifactDirectory)
  const tmpTarget = command.findIndex((value, index) => value === "/tmp" && command[index - 2] === "--bind")

  expect(tmpTarget).toBeGreaterThan(0)
  expect(tmpTarget).toBeLessThan(command.indexOf(worktreePath))
  expect(tmpTarget).toBeLessThan(command.indexOf(artifactDirectory))
})
