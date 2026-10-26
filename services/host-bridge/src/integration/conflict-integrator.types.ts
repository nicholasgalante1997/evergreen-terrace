/** @module Integrator-agent ports and outcomes. */

import type { IntegrationResolution, WorkerAdapter, WorkerAssignment } from "@evergreen-terrace/contracts"
import type {
  CommandGoalSnapshot,
  CommandWorkerAssignmentResult,
  CommandWorkerBrief,
  CommandWorkerSnapshot
} from "../command-api/command-api-client.types"
import type { WorkerBriefEntry, WorkerScheduleInput, WorkerScheduleStart } from "../workers/worker-scheduler.types"
import type { FactoryWorktreeRecord } from "../worktrees/worktree.types"

export interface ConflictIntegratorPorts {
  commandApi: {
    assignWorker(input: WorkerAssignment): Promise<CommandWorkerAssignmentResult>
    getWorkerBrief(workerId: string): Promise<CommandWorkerBrief>
  }
  scheduler: {
    recordBriefs(entries: readonly WorkerBriefEntry[]): Promise<string>
    start(input: WorkerScheduleInput): WorkerScheduleStart
  }
}

export interface ConflictResolutionInput {
  adapter: WorkerAdapter
  conflicted: CommandWorkerSnapshot
  goal: CommandGoalSnapshot
  integrationId: string
  merged: readonly CommandWorkerSnapshot[]
  paths: readonly string[]
  /** 1-based index of this conflict within the attempt; keys the integrator worker. */
  sequence: number
  worktree: FactoryWorktreeRecord
}

export type ConflictResolutionOutcome =
  | { kind: "resolved"; resolution: IntegrationResolution }
  | { detail: string; integratorWorkerId: string; kind: "failed" }
