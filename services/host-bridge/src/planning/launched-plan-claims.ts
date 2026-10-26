/** @module The scope claims of a goal's launched plan, keyed by the worker each task became. */

import type { CommandPlanSnapshot } from "../command-api/command-api-client.types"
import type { LaunchedPlanClaims } from "../integration/integration-train.types"

/** A goal launches at most one plan; earlier revisions never launched. */
export const launchedPlanClaims = (plans: readonly CommandPlanSnapshot[]): LaunchedPlanClaims | null => {
  const plan = plans.find((candidate) => candidate.status === "launched")
  if (plan?.launch === null || plan?.launch === undefined || plan.proposal === null) {
    return null
  }
  const tasks = new Map(plan.proposal.tasks.map((task) => [task.key, task]))
  return {
    planId: plan.id,
    workers: new Map(
      plan.launch.workers.flatMap(({ taskKey, workerId }) => {
        const task = tasks.get(taskKey)
        return task === undefined ? [] : [[workerId, { scope: task.scope, taskKey }] as const]
      })
    )
  }
}
