/** @module GitHub handoff service ports and results. */

import type { HandoffCompletion, HandoffPlan, HandoffRequest, HandoffResult, ValidationRecord } from "@evergreen-terrace/contracts"
import type { ProjectPolicy } from "@evergreen-terrace/project-policy"
import type {
  CommandGoalSnapshot,
  CommandHandoffBeginResult,
  CommandHandoffRequestResult,
  CommandHandoffSnapshot,
  CommandIntegrationSnapshot
} from "../command-api/command-api-client.types"
import type { GitHubPort } from "../github/github.types"

export interface HandoffCommandPort {
  beginHandoff(handoffId: string): Promise<CommandHandoffBeginResult>
  completeHandoff(handoffId: string, input: HandoffCompletion): Promise<void>
  findValidation(goalId: string, validationId: string): Promise<ValidationRecord>
  getGoal(goalId: string): Promise<CommandGoalSnapshot>
  getHandoff(handoffId: string): Promise<CommandHandoffSnapshot>
  getIntegration(integrationId: string): Promise<CommandIntegrationSnapshot>
  listGoalHandoffs(goalId: string): Promise<CommandHandoffSnapshot[]>
  requestHandoff(input: HandoffRequest): Promise<CommandHandoffRequestResult>
}

export interface HandoffServicePorts {
  commandApi: HandoffCommandPort
  github: GitHubPort
  loadPolicy: () => Promise<ProjectPolicy>
  /** Directory for preserved pull-request body and comment files. */
  workDirectory: string
}

export interface HandoffRequestOutcome {
  created: boolean
  decisionId: string
  handoffId: string
  plan: Omit<HandoffPlan, "bodyLength" | "bodySha256">
}

export type HandoffExecutionOutcome =
  | { handoffId: string; result: HandoffResult; status: "completed" }
  | { detail: string; handoffId: string; status: "failed" }
  | { handoffId: string; status: "declined" }
