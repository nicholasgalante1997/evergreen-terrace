/** @module First-goal gate tests: a goal needs a committed, unchanged policy and a matching remote. */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runProcess } from "../process/run-process"
import { GitWorkspace, GoalGateError } from "./git-workspace"

const identity = ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"]

const policy = (validation = "bun test") => `version = 1
project_id = "github.com/example/gate"
canonical_remote = "origin"
priority_classes = [{ name = "p1", weight = 50 }]
[goals]
max_concurrent = 4
[workers]
default_per_goal = 3
max_per_repository = 6
[branches]
protected = ["main"]
allowed_base_refs = ["main"]
classes = [{ name = "feature", prefix = "feature/" }]
[validation]
commands = ["${validation}"]
[risk]
decision_required = ["migration"]
`

describe("first-goal gate", () => {
  let root = ""

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "et-gate-"))
  })

  afterAll(async () => {
    await rm(root, { force: true, recursive: true })
  })

  const repository = async (name: string, commitPolicy: boolean, remote = "https://github.com/example/gate.git") => {
    const projectRoot = join(root, name)
    await Bun.write(join(projectRoot, "README.md"), "fixture\n")
    await runProcess(["git", "init", "--quiet", "--initial-branch=main"], projectRoot)
    await runProcess(["git", "remote", "add", "origin", remote], projectRoot)
    if (commitPolicy) {
      await Bun.write(join(projectRoot, ".et", "config.toml"), policy())
    }
    await runProcess(["git", "add", "--all"], projectRoot)
    await runProcess(["git", ...identity, "commit", "--quiet", "-m", "base"], projectRoot)
    if (!commitPolicy) {
      await Bun.write(join(projectRoot, ".et", "config.toml"), policy())
    }
    return new GitWorkspace(projectRoot)
  }

  test("accepts an onboarded base and returns the committed policy", async () => {
    const workspace = await repository("onboarded", true)
    const resolved = await workspace.resolveGoalBase({ baseRef: "main", priorityClass: "p1" })
    expect(resolved.policy.project_id).toBe("github.com/example/gate")
    expect(resolved.baseSha).toMatch(/^[0-9a-f]{40}$/)
  })

  test("refuses a base without a committed policy, even when the working copy has one", async () => {
    const workspace = await repository("uncommitted", false)
    await expect(workspace.resolveGoalBase({ baseRef: "main", priorityClass: "p1" })).rejects.toThrow(
      /not onboarded at main/
    )
  })

  test("refuses when the working copy's policy differs from the committed one", async () => {
    const workspace = await repository("diverged", true)
    await Bun.write(join(workspace.projectRoot, ".et", "config.toml"), policy("true"))
    await expect(workspace.resolveGoalBase({ baseRef: "main", priorityClass: "p1" })).rejects.toBeInstanceOf(
      GoalGateError
    )
  })

  test("refuses when the canonical remote names a different repository", async () => {
    const workspace = await repository("moved", true, "https://github.com/someone-else/gate.git")
    await expect(workspace.resolveGoalBase({ baseRef: "main", priorityClass: "p1" })).rejects.toThrow(
      /github.com\/someone-else\/gate/
    )
  })
})
