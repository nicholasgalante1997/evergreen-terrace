/** @module Proposed-policy composition tests: agents cannot weaken identity, capacity, protection, or the safety floor. */

import { describe, expect, test } from "bun:test"
import { onboardingProposalSchema } from "@evergreen-terrace/contracts"
import type { OnboardingFacts } from "@evergreen-terrace/contracts"
import { parseProjectPolicy } from "@evergreen-terrace/project-policy"
import { composePolicy, proposedPolicyToml } from "./policy-config"

const facts: OnboardingFacts = {
  activeBranch: "feature/x",
  baseRef: "main",
  baseSha: "a".repeat(40),
  collectedAt: new Date().toISOString(),
  defaultBranch: "main",
  existingPolicy: false,
  headSha: "b".repeat(40),
  localBranches: ["main", "dev"],
  manifests: ["package.json"],
  projectId: "github.com/example/repo",
  remote: { name: "origin", url: "git@github.com:example/repo.git" },
  topLevel: ["src/"],
  trackedFileCount: 10
}

const proposal = onboardingProposalSchema.parse({
  allowedBaseRefs: ["main", "dev"],
  profile: {},
  protectedBranches: ["dev"],
  validation: {
    commands: ["bun test --grep \"a \\\\ b\" 'single'"],
    setup: ["bun install --frozen-lockfile"],
    timeoutSeconds: 900
  }
})

describe("proposed policy", () => {
  test("renders TOML that parses back to exactly the composed policy", () => {
    const policy = composePolicy(facts, proposal, null)
    const toml = proposedPolicyToml(policy)
    expect(parseProjectPolicy(toml)).toEqual(policy)
    expect(policy.project_id).toBe("github.com/example/repo")
    expect(policy.branches.protected).toEqual(["main", "dev"])
    expect(policy.validation.commands[0]).toBe("bun test --grep \"a \\\\ b\" 'single'")
    expect(policy.permissions.auto_approve_validation_commands).toBe(false)
  })

  test("always requires decisions for every safety-floor risk category", () => {
    expect(composePolicy(facts, proposal, null).risk.decision_required).toEqual([
      "credential",
      "dependency",
      "destructive",
      "external_side_effect",
      "migration",
      "release",
      "security"
    ])
  })

  test("keeps an existing policy's capacity and protection, and only adds to protection", () => {
    const existing = composePolicy(facts, proposal, null)
    const revised = composePolicy(
      facts,
      { ...proposal, protectedBranches: [] },
      {
        ...existing,
        branches: { ...existing.branches, protected: ["main", "release"] },
        workers: { default_per_goal: 4, max_per_repository: 5 }
      }
    )
    expect(revised.branches.protected).toEqual(["main", "release"])
    expect(revised.workers).toEqual({ default_per_goal: 4, max_per_repository: 5 })
  })
})
