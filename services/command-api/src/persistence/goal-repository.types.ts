/** @module Command-goal persistence models. */

export interface StoredGoal {
  baseRef: string
  baseSha: string
  constraints: string[]
  createdEventId: string
  description: string
  id: string
  idempotencyKey: string
  priorityClass: string
  projectId: string
  references: string[]
  title: string
}

export interface GoalSummary {
  base_ref: string
  base_sha: string
  created_at: Date
  id: string
  priority_class: string
  project_id: string
  state: string
  title: string
}

export interface GoalDetail extends GoalSummary {
  constraints: string[]
  description: string
  references: string[]
}
