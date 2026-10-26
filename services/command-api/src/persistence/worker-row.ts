/** @module PostgreSQL worker-row conversion. */

import { workerAssignmentSchema, workerStateSchema } from "@evergreen-terrace/contracts"
import type { WorkerRecord } from "./worker-repository.types"

interface WorkerRow {
  adapter: unknown
  aggregate_sequence: unknown
  artifact_directory: unknown
  assigned_event_id: unknown
  attempt: unknown
  base_ref: unknown
  base_sha: unknown
  brief_sha256: unknown
  branch: unknown
  created_at: unknown
  depends_on_worker_ids: unknown
  goal_id: unknown
  id: unknown
  idempotency_key: unknown
  last_event_id: unknown
  lease_expires_at: unknown
  lease_owner: unknown
  manifest_path: unknown
  project_id: unknown
  role: unknown
  state: unknown
  state_detail: unknown
  updated_at: unknown
  worktree_path: unknown
}

const jsonValue = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value)

export const workerRecordFromRow = (row: WorkerRow): WorkerRecord => {
  const worker = workerAssignmentSchema.parse({
    adapter: row.adapter,
    dependsOnWorkerIds: jsonValue(row.depends_on_worker_ids),
    goalId: row.goal_id,
    idempotencyKey: row.idempotency_key,
    projectId: row.project_id,
    role: row.role,
    worktree: {
      artifactDirectory: row.artifact_directory,
      attempt: Number(row.attempt),
      baseRef: row.base_ref,
      baseSha: row.base_sha,
      branch: row.branch,
      manifestPath: row.manifest_path,
      worktreePath: row.worktree_path
    }
  })
  return {
    ...worker,
    assignedEventId: String(row.assigned_event_id),
    briefSha256: row.brief_sha256 === null || row.brief_sha256 === undefined ? null : String(row.brief_sha256),
    createdAt: new Date(String(row.created_at)),
    id: String(row.id),
    lastEventId: String(row.last_event_id),
    leaseExpiresAt: row.lease_expires_at === null ? null : new Date(String(row.lease_expires_at)),
    leaseOwner: row.lease_owner === null ? null : String(row.lease_owner),
    sequence: Number(row.aggregate_sequence),
    state: workerStateSchema.parse(row.state),
    stateDetail: String(row.state_detail),
    updatedAt: new Date(String(row.updated_at))
  }
}
