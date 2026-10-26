/** @module Mayor planner ports and results. */

import type { PlanStatus, WorkerAdapter, WorkerAssignment } from "@evergreen-terrace/contracts"
import type { ProjectPolicy } from "@evergreen-terrace/project-policy"
import type { CommandApiClient } from "../command-api/command-api-client"
import type { CommandWorkerAssignmentResult } from "../command-api/command-api-client.types"
import type {
  WorkerBriefEntry,
  WorkerScheduleInput,
  WorkerScheduleResult,
  WorkerScheduleStart
} from "../workers/worker-scheduler.types"
import type { FactoryWorktreeRecord, WorktreePreparation } from "../worktrees/worktree.types"
import type { ReadOnlyAgentPort, ReadOnlyCheckout } from "./read-only-agent.types"

export interface MayorPlannerPorts {
  agent: ReadOnlyAgentPort
  checkouts: {
    create(input: {
      baseSha: string
      key: string
      ownerId: string
      projectId: string
      purpose: "plans"
    }): Promise<ReadOnlyCheckout>
  }
  commandApi: Pick<
    CommandApiClient,
    | "beginPlanLaunch"
    | "completePlanDraft"
    | "completePlanLaunch"
    | "getDecision"
    | "getGoal"
    | "getPlan"
    | "listActiveProjectPlans"
    | "listGoalPlans"
    | "listGoalWorkers"
    | "listPreferences"
    | "startPlanDraft"
  > & { assignWorker(input: WorkerAssignment): Promise<CommandWorkerAssignmentResult> }
  loadPolicy: () => Promise<ProjectPolicy>
  scheduler: {
    recordBriefs(entries: readonly WorkerBriefEntry[]): Promise<string>
    start(input: WorkerScheduleInput): WorkerScheduleStart
  }
  /** Repository paths tracked at a commit; the basis for scope-claim overlap. */
  trackedFiles(commitSha: string): Promise<string[]>
  worktrees: { prepareOrReuse(input: WorktreePreparation): Promise<FactoryWorktreeRecord> }
}

export interface PlanDraftInput {
  adapter: WorkerAdapter
  /** Extra instructions for this revision, added to any recorded answers and revision notes. */
  feedback?: string
  goalId: string
  idempotencyKey?: string
}

export interface PlanDraftOutcome {
  decisionId: string | null
  detail: string
  planId: string
  questionDecisionIds: string[]
  status: PlanStatus
}

export interface PlanDraftStarted {
  completion: Promise<PlanDraftOutcome>
  planId: string
  revision: number
}

export interface PlanLaunchInput {
  adapter: WorkerAdapter
  branchClass: string
  maxConcurrency: number
  planId: string
}

export type PlanLaunchOutcome =
  | { detail: string; planId: string; status: "rejected" }
  | {
      completion: Promise<WorkerScheduleResult>
      goalId: string
      planId: string
      schedulerId: string
      status: "launched"
      workers: Array<{ taskKey: string; workerId: string }>
    }
