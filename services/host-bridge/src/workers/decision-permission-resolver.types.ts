/** @module Durable ACP permission-decision resolver contracts. */

export interface DecisionPermissionContext {
  goalId: string
  projectId: string
  role: string
  schedulerId: string
  workerId: string
  worktreePath: string
}
