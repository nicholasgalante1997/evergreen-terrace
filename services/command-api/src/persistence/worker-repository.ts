/** @module Command-worker aggregate repository. */

import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { WorkerState } from "@evergreen-terrace/contracts"
import type { SQL } from "bun"
import { workerRecordFromRow } from "./worker-row"
import type {
  CommandWorkerSummary,
  NewWorker,
  WorkerBriefRecord,
  WorkerLeaseUpdate,
  WorkerRecord
} from "./worker-repository.types"

export class WorkerRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  async create(worker: NewWorker): Promise<boolean> {
    const inserted = await this.sql`
      INSERT INTO evergreen.workers (
        id, project_id, goal_id, role, adapter, attempt, base_ref, base_sha, branch,
        worktree_path, manifest_path, artifact_directory, depends_on_worker_ids, idempotency_key,
        state, state_detail, aggregate_sequence, assigned_event_id, last_event_id
      )
      VALUES (
        ${worker.id}, ${worker.worker.projectId}, ${worker.worker.goalId}, ${worker.worker.role},
        ${worker.worker.adapter}, ${worker.worker.worktree.attempt}, ${worker.worker.worktree.baseRef},
        ${worker.worker.worktree.baseSha}, ${worker.worker.worktree.branch}, ${worker.worker.worktree.worktreePath},
        ${worker.worker.worktree.manifestPath}, ${worker.worker.worktree.artifactDirectory},
        ${JSON.stringify(worker.worker.dependsOnWorkerIds)}::text::jsonb,
        ${worker.worker.idempotencyKey}, ${"assigned"}, ${""}, ${1}, ${worker.assignedEventId},
        ${worker.assignedEventId}
      )
      ON CONFLICT (project_id, idempotency_key) DO NOTHING
      RETURNING id
    `
    return inserted[0] !== undefined
  }

  async findByIdempotency(projectId: string, idempotencyKey: string): Promise<WorkerRecord | undefined> {
    const rows = await this.sql`
      SELECT * FROM evergreen.workers WHERE project_id = ${projectId} AND idempotency_key = ${idempotencyKey}
    `
    return rows[0] === undefined ? undefined : workerRecordFromRow(rows[0])
  }

  async findById(id: string): Promise<WorkerRecord | undefined> {
    const rows = await this.sql`SELECT * FROM evergreen.workers WHERE id = ${id}`
    return rows[0] === undefined ? undefined : workerRecordFromRow(rows[0])
  }

  async findByIdForUpdate(id: string): Promise<WorkerRecord | undefined> {
    const rows = await this.sql`SELECT * FROM evergreen.workers WHERE id = ${id} FOR UPDATE`
    return rows[0] === undefined ? undefined : workerRecordFromRow(rows[0])
  }

  /** The database clock is the only clock that judges lease expiry. */
  async databaseNow(): Promise<Date> {
    const rows = await this.sql`SELECT now() AS now`
    return new Date(String(rows[0]?.now))
  }

  async setLease(id: string, lease: WorkerLeaseUpdate): Promise<void> {
    const updated = await this.sql`
      UPDATE evergreen.workers
      SET lease_owner = ${lease.owner}, lease_expires_at = ${lease.expiresAt}, last_event_id = ${lease.eventId},
          aggregate_sequence = ${lease.sequence}, updated_at = now()
      WHERE id = ${id} AND aggregate_sequence = ${lease.sequence - 1}
      RETURNING id
    `
    if (updated[0] === undefined) {
      throw new Error(`Worker ${id} changed concurrently while updating its lease`)
    }
  }

  async recordBrief(brief: WorkerBriefRecord, sequence: number): Promise<void> {
    await this.sql`
      INSERT INTO evergreen.worker_briefs (worker_id, prompt, sha256, recorded_event_id)
      VALUES (${brief.workerId}, ${brief.prompt}, ${brief.sha256}, ${brief.recordedEventId})
    `
    const updated = await this.sql`
      UPDATE evergreen.workers
      SET brief_sha256 = ${brief.sha256}, last_event_id = ${brief.recordedEventId},
          aggregate_sequence = ${sequence}, updated_at = now()
      WHERE id = ${brief.workerId} AND aggregate_sequence = ${sequence - 1}
      RETURNING id
    `
    if (updated[0] === undefined) {
      throw new Error(`Worker ${brief.workerId} changed concurrently while recording its brief`)
    }
  }

  async findBrief(workerId: string): Promise<WorkerBriefRecord | undefined> {
    const rows = await this.sql`
      SELECT worker_id, prompt, sha256, recorded_event_id FROM evergreen.worker_briefs WHERE worker_id = ${workerId}
    `
    const row = rows[0]
    return row === undefined
      ? undefined
      : {
          prompt: String(row.prompt),
          recordedEventId: String(row.recorded_event_id),
          sha256: String(row.sha256),
          workerId: String(row.worker_id)
        }
  }

  async listByGoal(goalId: string): Promise<WorkerRecord[]> {
    const rows = await this.sql`SELECT * FROM evergreen.workers WHERE goal_id = ${goalId} ORDER BY created_at ASC`
    return rows.map(workerRecordFromRow)
  }

  async list(projectId: string | null): Promise<CommandWorkerSummary[]> {
    return projectId === null
      ? this.sql`
          SELECT id, project_id, goal_id, role, adapter, state, created_at, updated_at
          FROM evergreen.workers ORDER BY created_at DESC
        `
      : this.sql`
          SELECT id, project_id, goal_id, role, adapter, state, created_at, updated_at
          FROM evergreen.workers WHERE project_id = ${projectId} ORDER BY created_at DESC
        `
  }

  async transition(id: string, state: WorkerState, detail: string, eventId: string, sequence: number): Promise<void> {
    const updated = await this.sql`
      UPDATE evergreen.workers
      SET state = ${state}, state_detail = ${detail}, last_event_id = ${eventId},
          aggregate_sequence = ${sequence}, updated_at = now()
      WHERE id = ${id} AND aggregate_sequence = ${sequence - 1}
      RETURNING id
    `
    if (updated[0] === undefined) {
      throw new Error(`Worker ${id} changed concurrently while transitioning to ${state}`)
    }
  }
}
