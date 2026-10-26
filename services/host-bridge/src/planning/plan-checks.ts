/** @module Pure host checks on a mayor plan, beyond its schema: capacity, ordering, and cross-goal claims. */

import type { MayorPlan, PlanOverlap, RiskCategory } from "@evergreen-terrace/contracts"
import type { ProjectPolicy } from "@evergreen-terrace/project-policy"
import { claimOverlap } from "./scope-claims"

export interface ActivePlanClaims {
  goalId: string
  planId: string
  tasks: ReadonlyArray<{ key: string; scope: readonly string[] }>
}

/** A goal may use up to the repository's worker capacity, never more than six. */
export const maximumPlanTasks = (policy: ProjectPolicy): number => Math.min(6, policy.workers.max_per_repository)

const dependsTransitively = (plan: MayorPlan, from: string, to: string): boolean => {
  const seen = new Set<string>()
  const visit = (key: string): boolean => {
    if (key === to) {
      return true
    }
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return (plan.tasks.find((task) => task.key === key)?.dependsOn ?? []).some(visit)
  }
  return (plan.tasks.find((task) => task.key === from)?.dependsOn ?? []).some(visit)
}

/** Problems the agent must fix; each is phrased so it can act on it. */
export const planIssues = (
  plan: MayorPlan,
  context: { activeGoalIds: ReadonlySet<string>; maximumTasks: number; trackedFiles: readonly string[] }
): string[] => {
  const issues: string[] = []
  if (plan.tasks.length > context.maximumTasks) {
    issues.push(
      `tasks: the project allows at most ${context.maximumTasks} task(s) for one goal; you returned ${plan.tasks.length}`
    )
  }
  for (const goalId of plan.integrateAfterGoalIds) {
    if (!context.activeGoalIds.has(goalId)) {
      issues.push(`integrateAfterGoalIds: ${goalId} is not one of the other active goals listed in the prompt`)
    }
  }
  for (const [index, left] of plan.tasks.entries()) {
    for (const right of plan.tasks.slice(index + 1)) {
      const shared = claimOverlap(context.trackedFiles, left.scope, right.scope)
      if (
        shared.length > 0 &&
        !dependsTransitively(plan, left.key, right.key) &&
        !dependsTransitively(plan, right.key, left.key)
      ) {
        issues.push(
          `tasks: ${left.key} and ${right.key} both claim ${shared.slice(0, 5).join(", ")}; narrow the claims or order the tasks with dependsOn`
        )
      }
    }
  }
  return issues
}

/** Where this plan's claims meet other active goals' claims; recorded on the approval card. */
export const crossGoalOverlaps = (
  plan: MayorPlan,
  others: readonly ActivePlanClaims[],
  trackedFiles: readonly string[]
): PlanOverlap[] =>
  others
    .flatMap((other) =>
      plan.tasks.flatMap((task) =>
        other.tasks.flatMap((otherTask) => {
          const paths = claimOverlap(trackedFiles, task.scope, otherTask.scope)
          return paths.length === 0
            ? []
            : [
                {
                  otherGoalId: other.goalId,
                  otherPlanId: other.planId,
                  otherTaskKey: otherTask.key,
                  paths: paths.slice(0, 200),
                  taskKey: task.key
                }
              ]
        })
      )
    )
    .slice(0, 64)

/** Plan risks whose category `.et` says needs a decision. */
export const flaggedRisks = (plan: MayorPlan, policy: ProjectPolicy): RiskCategory[] => {
  const required = new Set<string>(policy.risk.decision_required)
  return [
    ...new Set(
      plan.risks.map((risk) => risk.category).filter((category): category is RiskCategory => required.has(category))
    )
  ]
}
