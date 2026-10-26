/** @module Pure policy guard for a GitHub handoff plan. */

import { isAllowedBaseRef, isProtectedBranch } from "@evergreen-terrace/project-policy"
import type { ProjectPolicy } from "@evergreen-terrace/project-policy"

export interface HandoffTarget {
  remote: string
  repository: string
}

/** Resolves the GitHub repository and remote from policy, refusing anything outside a factory branch. */
export const assertHandoffPolicy = (policy: ProjectPolicy, input: { baseRef: string; branch: string }): HandoffTarget => {
  const repository = policy.project_id.startsWith("github.com/") ? policy.project_id.slice("github.com/".length) : null
  if (repository === null) {
    throw new Error(`GitHub handoff requires a github.com project identity: ${policy.project_id}`)
  }
  if (isProtectedBranch(policy, input.branch)) {
    throw new Error(`GitHub handoff never pushes a protected branch: ${input.branch}`)
  }
  if (!policy.branches.classes.some((branchClass) => input.branch.startsWith(`${branchClass.prefix}et-`))) {
    throw new Error(`GitHub handoff pushes only factory branches: ${input.branch}`)
  }
  if (!isAllowedBaseRef(policy, input.baseRef)) {
    throw new Error(`Pull request base is not an allowed base ref: ${input.baseRef}`)
  }
  return { remote: policy.canonical_remote, repository }
}
