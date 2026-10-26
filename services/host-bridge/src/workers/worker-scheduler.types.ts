/** @module Durable lease-based worker-scheduler contracts. */

import type {
  CommandWorkerBrief,
  CommandWorkerBriefResult,
  CommandWorkerLeaseReconcileResult,
  CommandWorkerLeaseResult,
  CommandWorkerSnapshot,
  CommandWorkerStateChangeResult
} from "../command-api/command-api-client.types"
import type { WorkerExecutionInput, WorkerExecutionResult } from "./worker-execution.types"

export interface WorkerLeaseRenewalPort {
  renewWorkerLease(workerId: string, schedulerId: string, ttlSeconds: number): Promise<CommandWorkerLeaseResult>
}

export interface WorkerSchedulerCommandPort extends WorkerLeaseRenewalPort {
  acquireWorkerLease(workerId: string, schedulerId: string, ttlSeconds: number): Promise<CommandWorkerLeaseResult>
  changeWorkerState(workerId: string, input: { detail: string; state: "failed" }): Promise<CommandWorkerStateChangeResult>
  getWorker(workerId: string): Promise<CommandWorkerSnapshot>
  getWorkerBrief(workerId: string): Promise<CommandWorkerBrief>
  listGoalWorkers(goalId: string): Promise<CommandWorkerSnapshot[]>
  reconcileWorkerLease(workerId: string, schedulerId: string): Promise<CommandWorkerLeaseReconcileResult>
  recordWorkerBrief(workerId: string, prompt: string): Promise<CommandWorkerBriefResult>
  releaseWorkerLease(workerId: string, schedulerId: string): Promise<void>
}

export interface WorkerExecutionPort {
  execute(input: WorkerExecutionInput): Promise<WorkerExecutionResult>
}

export interface WorkerSchedulerOptions {
  leaseTtlSeconds: number
  /** Overrides the renewal cadence; defaults to a third of the TTL. */
  renewIntervalMs?: number
  schedulerId: string
}

export interface WorkerBriefEntry {
  prompt: string
  workerId: string
}

export interface WorkerScheduleInput {
  goalId: string
  maxConcurrency: number
  /** Restricts the schedule to these workers; all goal workers otherwise. */
  workerIds?: readonly string[]
}

export type WorkerScheduleOutcomeState = "blocked" | "completed" | "failed"

export interface WorkerScheduleOutcome {
  detail: string
  state: WorkerScheduleOutcomeState
  workerId: string
}

export interface WorkerScheduleResult {
  goalId: string
  outcomes: WorkerScheduleOutcome[]
  schedulerId: string
}

export interface WorkerScheduleStart {
  alreadyRunning: boolean
  completion: Promise<WorkerScheduleResult>
  goalId: string
  schedulerId: string
}
