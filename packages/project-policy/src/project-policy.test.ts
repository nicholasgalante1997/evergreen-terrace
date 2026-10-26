/** @module Strict .et project-policy tests. */

import { describe, expect, test } from "bun:test"
import { assertGoalPolicy, assertWorkerRole, createFactoryBranchName, parseProjectPolicy } from "./index"

const validPolicy = `
version = 1
project_id = "github.com/nicholasgalante1997/evergreen-terrace"
canonical_remote = "origin"
priority_classes = [{ name = "p0", weight = 100 }, { name = "p1", weight = 50 }]

[goals]
max_concurrent = 4

[workers]
default_per_goal = 3
max_per_repository = 6

[branches]
protected = ["main", "dev"]
allowed_base_refs = ["main", "dev"]
classes = [{ name = "feature", prefix = "feature/" }, { name = "patch", prefix = "patch/" }]

[validation]
commands = ["bun run typecheck"]

[risk]
decision_required = ["migration", "security"]
`

describe("project policy", () => {
  test("parses strict TOML and derives factory branch names", () => {
    const policy = parseProjectPolicy(validPolicy)
    assertGoalPolicy(policy, { baseRef: "main", priorityClass: "p1" })
    expect(createFactoryBranchName(policy, { branchClass: "feature", goalId: "goal-123", role: "implementer" })).toBe(
      "feature/et-goal-123/implementer"
    )
  })

  test("rejects unknown fields and forbidden goal policy", () => {
    expect(() => parseProjectPolicy(`${validPolicy}\nunexpected = true\n`)).toThrow("strict project policy")
    const policy = parseProjectPolicy(validPolicy)
    expect(() => assertGoalPolicy(policy, { baseRef: "topic/unsafe", priorityClass: "p1" })).toThrow(
      "Base ref is not allowed"
    )
  })

  test("defaults validation setup and timeout, and reserves the integration role", () => {
    const policy = parseProjectPolicy(validPolicy)
    expect(policy.validation.setup).toEqual([])
    expect(policy.validation.timeout_seconds).toBe(1_200)
    expect(policy.permissions.auto_approve_validation_commands).toBe(false)
    expect(parseProjectPolicy(`${validPolicy}\n[permissions]\nauto_approve_validation_commands = true\n`).permissions.auto_approve_validation_commands).toBe(true)
    expect(() => parseProjectPolicy(`${validPolicy}\n[permissions]\nauto_approve_everything = true\n`)).toThrow()
    expect(() => assertWorkerRole("integration")).toThrow("reserved")
    expect(() => assertWorkerRole("integrator")).toThrow("reserved")
    expect(() => assertWorkerRole("implementer")).not.toThrow()
  })
})
