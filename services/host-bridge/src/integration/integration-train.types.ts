/** @module Integration-train ports and results. */

import type {
  IntegrationCompletion,
  IntegrationCompletionInput,
  IntegrationStartInput,
  WorkerAdapter
} from "@evergreen-terrace/contracts"
import type {
  CommandGoalSnapshot,
  CommandIntegrationCompletionResult,
  CommandIntegrationSnapshot,
  CommandIntegrationStartResult,
  CommandWorkerSnapshot
} from "../command-api/command-api-client.types"
import type { ValidationOutcome, ValidationRequest } from "../validation/validation.types"
import type { FactoryWorktreeRecord, WorktreePreparation } from "../worktrees/worktree.types"
import type { ConflictResolutionInput, ConflictResolutionOutcome } from "./conflict-integrator.types"

export interface IntegrationTrainPorts {
  commandApi: {
    completeIntegration(integrationId: string, input: IntegrationCompletionInput): Promise<CommandIntegrationCompletionResult>
    getGoal(goalId: string): Promise<CommandGoalSnapshot>
    getIntegration(integrationId: string): Promise<CommandIntegrationSnapshot>
    listGoalWorkers(goalId: string): Promise<CommandWorkerSnapshot[]>
    startIntegration(input: IntegrationStartInput): Promise<CommandIntegrationStartResult>
  }
  /** Optional: without it, `resolve` is refused and conflicts are only recorded. */
  integrator?: {
    resolve(input: ConflictResolutionInput): Promise<ConflictResolutionOutcome>
  }
  validation: {
    validate(request: ValidationRequest): Promise<ValidationOutcome>
  }
  worktrees: {
    prepare(input: WorktreePreparation): Promise<FactoryWorktreeRecord>
  }
}

export interface IntegrationRunInput {
  branchClass: string
  /** Worker output deliberately left out of this attempt; requires `selectionRationale`. */
  excludeWorkerIds?: readonly string[]
  goalId: string
  selectionRationale?: string
}

export interface IntegrationResolveInput {
  adapter: WorkerAdapter
  branchClass: string
  integrationId: string
}

export interface IntegrationRunResult {
  attempt: number
  completion: IntegrationCompletion
  integrationId: string
}
