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

test("a read-only session mounts its checkout read-only, but keeps its artifact directory writable", async () => {
  const artifactDirectory = await mkdtemp("/tmp/et-worker-sandbox-ro-")
  const checkout = await mkdtemp("/tmp/et-worker-sandbox-checkout-")
  const command = await workerSandboxCommand("claude", "claude-agent-acp", checkout, artifactDirectory, {
    readOnly: true
  })
  const checkoutMount = command.indexOf(checkout)

  expect(command[checkoutMount - 1]).toBe("--ro-bind")
  expect(command[command.indexOf(artifactDirectory) - 1]).toBe("--bind")
})

test("under real Bubblewrap, a read-only session cannot write its checkout but can write its artifacts", async () => {
  const artifactDirectory = await mkdtemp("/tmp/et-worker-sandbox-ro-real-")
  const checkout = await mkdtemp("/tmp/et-worker-sandbox-checkout-real-")
  const sandbox = (await workerSandboxCommand("claude", "unused", checkout, artifactDirectory, { readOnly: true })).slice(
    0,
    -1
  )
  const attempt = (script: string) =>
    Bun.spawn([...sandbox, "/bin/sh", "-c", script], { stderr: "ignore", stdout: "ignore" }).exited

  expect(await attempt(`touch ${checkout}/planted`)).not.toBe(0)
  expect(await Bun.file(`${checkout}/planted`).exists()).toBe(false)
  expect(await attempt(`touch ${artifactDirectory}/log`)).toBe(0)
})

test("under real Bubblewrap, a worktree of a repository under /tmp can read its Git metadata but not write it", async () => {
  const repository = await mkdtemp("/tmp/et-worker-sandbox-repo-")
  const run = (command: string[], cwd: string) => Bun.spawn(command, { cwd, stderr: "ignore", stdout: "ignore" }).exited
  await run(["git", "init", "--quiet", "--initial-branch=main"], repository)
  await run(
    [
      "git",
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      "base"
    ],
    repository
  )
  const worktree = `${repository}-worktree`
  await run(["git", "worktree", "add", "--quiet", "--detach", worktree, "HEAD"], repository)
  const artifactDirectory = await mkdtemp("/tmp/et-worker-sandbox-git-")
  const sandbox = (await workerSandboxCommand("claude", "unused", worktree, artifactDirectory)).slice(0, -1)
  const attempt = (script: string) =>
    Bun.spawn([...sandbox, "/bin/sh", "-c", script], { stderr: "ignore", stdout: "ignore" }).exited

  expect(await attempt("git log --oneline -n 1")).toBe(0)
  expect(await attempt("git -c user.name=w -c user.email=w@w commit --allow-empty -m sneaky")).not.toBe(0)
})
