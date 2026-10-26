/** @module Read-model goal persistence models. */

export interface ReadGoal {
  base_ref: string
  base_sha: string
  description: string
  id: string
  priority_class: string
  project_id: string
  state: string
  submitted_at: Date
  title: string
  updated_at: Date
}
