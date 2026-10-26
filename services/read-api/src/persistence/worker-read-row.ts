/** @module PostgreSQL read-worker row conversion. */

import { workerAdapterSchema, workerDependencyIdsSchema, workerStateSchema, workerWorktreeSchema } from "@evergreen-terrace/contracts"
import type { ReadWorker } from "./worker-read-repository.types"

interface ReadWorkerRow {
  adapter: unknown
  artifact_directory: unknown
  attempt: unknown
  base_ref: unknown
  base_sha: unknown
  brief_sha256: unknown
  branch: unknown
  depends_on_worker_ids: unknown
  goal_id: unknown
  id: unknown
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

const nullableString = (value: unknown): string | null => (value === null || value === undefined ? null : String(value))

export const readWorkerFromRow = (row: ReadWorkerRow): ReadWorker => ({
  adapter: workerAdapterSchema.parse(row.adapter),
  brief_sha256: nullableString(row.brief_sha256),
  lease_expires_at: row.lease_expires_at === null || row.lease_expires_at === undefined ? null : new Date(String(row.lease_expires_at)),
  lease_owner: nullableString(row.lease_owner),
  depends_on_worker_ids: workerDependencyIdsSchema.parse(jsonValue(row.depends_on_worker_ids)),
  goal_id: String(row.goal_id),
  id: String(row.id),
  project_id: String(row.project_id),
  role: String(row.role),
  state: workerStateSchema.parse(row.state),
  state_detail: String(row.state_detail),
  updated_at: new Date(String(row.updated_at)),
  worktree: workerWorktreeSchema.parse({
    artifactDirectory: row.artifact_directory,
    attempt: Number(row.attempt),
    baseRef: row.base_ref,
    baseSha: row.base_sha,
    branch: row.branch,
    manifestPath: row.manifest_path,
    worktreePath: row.worktree_path
  })
})
