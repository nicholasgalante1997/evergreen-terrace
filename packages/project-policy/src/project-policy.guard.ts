/** @module Pure policy guards for governed goal and branch actions. */

import type { BranchClass, PriorityClass, ProjectPolicy } from "./project-policy.types"

export const isProtectedBranch = (policy: ProjectPolicy, branch: string): boolean =>
  policy.branches.protected.includes(branch)

export const isAllowedBaseRef = (policy: ProjectPolicy, baseRef: string): boolean =>
  policy.branches.allowed_base_refs.includes(baseRef)

export const findBranchClass = (policy: ProjectPolicy, name: string): BranchClass | undefined =>
  policy.branches.classes.find((branchClass) => branchClass.name === name)

export const findPriorityClass = (policy: ProjectPolicy, name: string): PriorityClass | undefined =>
  policy.priority_classes.find((priorityClass) => priorityClass.name === name)

export const assertGoalPolicy = (policy: ProjectPolicy, input: { baseRef: string; priorityClass: string }): void => {
  if (!isAllowedBaseRef(policy, input.baseRef)) {
    throw new Error(`Base ref is not allowed by project policy: ${input.baseRef}`)
  }
  if (findPriorityClass(policy, input.priorityClass) === undefined) {
    throw new Error(`Priority class is not allowed by project policy: ${input.priorityClass}`)
  }
}

export const createFactoryBranchName = (
  policy: ProjectPolicy,
  input: { branchClass: string; goalId: string; role: string }
): string => {
  const branchClass = findBranchClass(policy, input.branchClass)
  if (branchClass === undefined) {
    throw new Error(`Branch class is not allowed by project policy: ${input.branchClass}`)
  }
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(input.role)) {
    throw new Error(`Worker role cannot be used in a factory branch name: ${input.role}`)
  }

  return `${branchClass.prefix}et-${input.goalId}/${input.role}`
}

/** Role reserved for the per-goal integration branch; workers may not claim it. */
export const integrationRole = "integration"

/** Role reserved for the conflict-resolving integrator agent; assigned only by the integration train. */
export const integratorRole = "integrator"

export const assertWorkerRole = (role: string): void => {
  if (role === integrationRole || role === integratorRole) {
    throw new Error(`Worker role is reserved for the integration train: ${role}`)
  }
}
