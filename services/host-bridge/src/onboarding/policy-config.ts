/** @module Composition and rendering of the proposed `.et/config.toml`; the host, not an agent, writes policy. */

import type { OnboardingFacts, OnboardingProposal } from "@evergreen-terrace/contracts"
import { riskCategorySchema } from "@evergreen-terrace/contracts"
import { parseProjectPolicy } from "@evergreen-terrace/project-policy"
import type { ProjectPolicy } from "@evergreen-terrace/project-policy"
import { canonicalJson } from "../support/canonical-json"

const unique = (values: readonly string[]): string[] => [...new Set(values.filter((value) => value.trim().length > 0))]

/**
 * Agents propose only validation commands, extra protected branches, and base
 * refs. Identity comes from Git; capacity, priorities, branch classes, and
 * permissions keep the existing policy or the safe defaults; protection is
 * only ever added to; and every safety-floor risk category requires a card.
 */
export const composePolicy = (
  facts: OnboardingFacts,
  proposal: OnboardingProposal,
  existing: ProjectPolicy | null
): ProjectPolicy => ({
  branches: {
    allowed_base_refs: unique([facts.baseRef, ...proposal.allowedBaseRefs]),
    classes: existing?.branches.classes ?? [
      { name: "feature", prefix: "feature/" },
      { name: "patch", prefix: "patch/" }
    ],
    protected: unique([
      ...(existing?.branches.protected ?? []),
      facts.defaultBranch ?? facts.baseRef,
      ...proposal.protectedBranches
    ])
  },
  canonical_remote: facts.remote.name,
  goals: existing?.goals ?? { max_concurrent: 4 },
  permissions: existing?.permissions ?? { auto_approve_validation_commands: false },
  priority_classes: existing?.priority_classes ?? [
    { name: "p0", weight: 100 },
    { name: "p1", weight: 50 },
    { name: "p2", weight: 20 },
    { name: "p3", weight: 5 }
  ],
  project_id: facts.projectId,
  risk: { decision_required: [...riskCategorySchema.options] },
  validation: {
    commands: unique(proposal.validation.commands),
    setup: unique(proposal.validation.setup),
    timeout_seconds: proposal.validation.timeoutSeconds
  },
  version: 1,
  workers: existing?.workers ?? { default_per_goal: 3, max_per_repository: 6 }
})

/** A TOML basic string; JSON's escapes are a subset of TOML's. */
const string = (value: string): string => JSON.stringify(value)

const list = (values: readonly string[], indent = "  "): string =>
  values.length === 0 ? "[]" : `[\n${values.map((value) => `${indent}${string(value)}`).join(",\n")}\n]`

export const renderPolicyToml = (policy: ProjectPolicy): string =>
  [
    "# Evergreen Terrace project policy. Approved through onboarding; change it only on a factory branch.",
    "version = 1",
    `project_id = ${string(policy.project_id)}`,
    `canonical_remote = ${string(policy.canonical_remote)}`,
    "priority_classes = [",
    policy.priority_classes
      .map((priority) => `  { name = ${string(priority.name)}, weight = ${priority.weight} }`)
      .join(",\n"),
    "]",
    "",
    "[goals]",
    `max_concurrent = ${policy.goals.max_concurrent}`,
    "",
    "[workers]",
    `default_per_goal = ${policy.workers.default_per_goal}`,
    `max_per_repository = ${policy.workers.max_per_repository}`,
    "",
    "[branches]",
    `protected = ${list(policy.branches.protected)}`,
    `allowed_base_refs = ${list(policy.branches.allowed_base_refs)}`,
    "classes = [",
    policy.branches.classes
      .map((branchClass) => `  { name = ${string(branchClass.name)}, prefix = ${string(branchClass.prefix)} }`)
      .join(",\n"),
    "]",
    "",
    "[validation]",
    "# Setup is the only phase with network access; checks run offline in the sandbox.",
    `setup = ${list(policy.validation.setup)}`,
    `commands = ${list(policy.validation.commands)}`,
    `timeout_seconds = ${policy.validation.timeout_seconds}`,
    "",
    "[permissions]",
    `auto_approve_validation_commands = ${policy.permissions.auto_approve_validation_commands}`,
    "",
    "[risk]",
    `decision_required = ${list(policy.risk.decision_required)}`,
    ""
  ].join("\n")

/** Renders, then proves the text parses under the strict schema back to the same policy. */
export const proposedPolicyToml = (policy: ProjectPolicy): string => {
  const text = renderPolicyToml(policy)
  const parsed = parseProjectPolicy(text)
  if (canonicalJson(parsed) !== canonicalJson(policy)) {
    throw new Error("The rendered .et/config.toml does not round-trip to the composed policy")
  }
  return text
}
