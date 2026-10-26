/** @module Read-model worker persistence contracts. */

import type { WorkerAdapter, WorkerState, WorkerWorktree } from "@evergreen-terrace/contracts"

export interface ReadWorker {
  adapter: WorkerAdapter
  brief_sha256: string | null
  depends_on_worker_ids: string[]
  goal_id: string
  id: string
  lease_expires_at: Date | null
  lease_owner: string | null
  project_id: string
  role: string
  state: WorkerState
  state_detail: string
  updated_at: Date
  worktree: WorkerWorktree
}
