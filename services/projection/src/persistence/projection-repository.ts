/** @module Idempotent read-model projection repository. */

import {
  decisionRequestedPayloadSchema,
  decisionResolvedProjectionPayloadSchema,
  goalSubmittedPayloadSchema,
  handoffUpdatedPayloadSchema,
  integrationUpdatedPayloadSchema,
  validationCompletedPayloadSchema,
  workerAssignedPayloadSchema,
  workerBriefRecordedPayloadSchema,
  workerLeaseAcquiredPayloadSchema,
  workerLeaseExpiredPayloadSchema,
  workerLeaseReleasedPayloadSchema,
  workerStateChangedPayloadSchema
} from "@evergreen-terrace/contracts"
import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { EventEnvelope } from "@evergreen-terrace/contracts"
import type { SQL } from "bun"

export class ProjectionRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  async recordEvent(event: EventEnvelope): Promise<boolean> {
    const inserted = await this.sql`
      INSERT INTO evergreen_read.events (event_id, event_type, aggregate_type, aggregate_id, occurred_at, envelope)
      VALUES (
        ${event.eventId}, ${event.eventType}, ${event.aggregate.type}, ${event.aggregate.id},
        ${event.occurredAt}, ${JSON.stringify(event)}::text::jsonb
      )
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    `
    return inserted[0] !== undefined
  }

  async projectGoalSubmitted(event: EventEnvelope): Promise<void> {
    const payload = goalSubmittedPayloadSchema.parse(event.payload)
    await this.sql`
      INSERT INTO evergreen_read.goals (
        id, project_id, title, description, priority_class, base_ref, base_sha, state, source_event_id, submitted_at
      )
      VALUES (
        ${payload.goal.id}, ${payload.goal.projectId}, ${payload.goal.title}, ${payload.goal.description},
        ${payload.goal.priorityClass}, ${payload.goal.baseRef}, ${payload.goal.baseSha}, ${"submitted"},
        ${event.eventId}, ${event.occurredAt}
      )
      ON CONFLICT (id) DO NOTHING
    `
  }

  async projectDecisionRequested(event: EventEnvelope): Promise<void> {
    const payload = decisionRequestedPayloadSchema.parse(event.payload)
    const { decision } = payload
    await this.sql`
      INSERT INTO evergreen_read.decisions (
        id, project_id, goal_id, category, title, context, options, recommended_option_id,
        status, requested_event_id, requested_at, updated_at
      )
      VALUES (
        ${decision.id}, ${decision.projectId}, ${decision.goalId}, ${decision.category}, ${decision.title},
        ${decision.context}, ${JSON.stringify(decision.options)}::text::jsonb, ${decision.recommendedOptionId},
        ${decision.status}, ${event.eventId}, ${event.occurredAt}, ${event.occurredAt}
      )
      ON CONFLICT (id) DO NOTHING
    `
  }

  async projectDecisionResolved(event: EventEnvelope): Promise<void> {
    const payload = decisionResolvedProjectionPayloadSchema.parse(event.payload)
    const { decision } = payload
    await this.sql`
      UPDATE evergreen_read.decisions
      SET status = ${decision.status}, resolution = ${JSON.stringify(decision.resolution)}::text::jsonb,
          resolved_event_id = ${event.eventId}, resolved_at = ${event.occurredAt}, updated_at = ${event.occurredAt}
      WHERE id = ${decision.id} AND status = ${"requested"}
    `
  }

  async projectWorkerAssigned(event: EventEnvelope): Promise<void> {
    const payload = workerAssignedPayloadSchema.parse(event.payload)
    const { worker } = payload
    await this.sql`
      INSERT INTO evergreen_read.workers (
        id, project_id, goal_id, role, adapter, attempt, base_ref, base_sha, branch,
        worktree_path, manifest_path, artifact_directory, depends_on_worker_ids, state, state_detail,
        assigned_event_id, last_event_id, assigned_at, updated_at
      )
      VALUES (
        ${worker.id}, ${worker.projectId}, ${worker.goalId}, ${worker.role}, ${worker.adapter},
        ${worker.worktree.attempt}, ${worker.worktree.baseRef}, ${worker.worktree.baseSha}, ${worker.worktree.branch},
        ${worker.worktree.worktreePath}, ${worker.worktree.manifestPath}, ${worker.worktree.artifactDirectory},
        ${JSON.stringify(worker.dependsOnWorkerIds)}::text::jsonb,
        ${worker.state}, ${""}, ${event.eventId}, ${event.eventId}, ${event.occurredAt}, ${event.occurredAt}
      )
      ON CONFLICT (id) DO NOTHING
    `
  }

  async projectWorkerStateChanged(event: EventEnvelope): Promise<void> {
    const payload = workerStateChangedPayloadSchema.parse(event.payload)
    const { worker } = payload
    await this.sql`
      UPDATE evergreen_read.workers
      SET state = ${worker.state}, state_detail = ${worker.detail}, last_event_id = ${event.eventId},
          updated_at = ${event.occurredAt}
      WHERE id = ${worker.id}
    `
  }

  async projectWorkerBriefRecorded(event: EventEnvelope): Promise<void> {
    const { worker } = workerBriefRecordedPayloadSchema.parse(event.payload)
    await this.sql`
      UPDATE evergreen_read.workers
      SET brief_sha256 = ${worker.briefSha256}, last_event_id = ${event.eventId}, updated_at = ${event.occurredAt}
      WHERE id = ${worker.id}
    `
  }

  async projectWorkerLeaseHeld(event: EventEnvelope): Promise<void> {
    const { worker } = workerLeaseAcquiredPayloadSchema.parse(event.payload)
    await this.sql`
      UPDATE evergreen_read.workers
      SET lease_owner = ${worker.lease.owner}, lease_expires_at = ${worker.lease.expiresAt},
          last_event_id = ${event.eventId}, updated_at = ${event.occurredAt}
      WHERE id = ${worker.id}
    `
  }

  async projectWorkerLeaseCleared(event: EventEnvelope): Promise<void> {
    const workerId =
      event.eventType === "worker.lease_expired"
        ? workerLeaseExpiredPayloadSchema.parse(event.payload).worker.id
        : workerLeaseReleasedPayloadSchema.parse(event.payload).worker.id
    await this.sql`
      UPDATE evergreen_read.workers
      SET lease_owner = NULL, lease_expires_at = NULL, last_event_id = ${event.eventId}, updated_at = ${event.occurredAt}
      WHERE id = ${workerId}
    `
  }

  async projectValidationCompleted(event: EventEnvelope): Promise<void> {
    const { validation } = validationCompletedPayloadSchema.parse(event.payload)
    await this.sql`
      INSERT INTO evergreen_read.validations (
        id, project_id, goal_id, subject_type, subject_id, commit_sha, status, record, source_event_id, completed_at
      )
      VALUES (
        ${validation.id}, ${validation.projectId}, ${validation.goalId}, ${validation.subject.type}, ${validation.subject.id},
        ${validation.commitSha}, ${validation.status}, ${JSON.stringify(validation)}::text::jsonb, ${event.eventId},
        ${validation.completedAt}
      )
      ON CONFLICT (id) DO NOTHING
    `
  }

  async projectIntegrationUpdated(event: EventEnvelope): Promise<void> {
    const { integration } = integrationUpdatedPayloadSchema.parse(event.payload)
    const completion = "completion" in integration ? JSON.stringify(integration.completion) : null
    await this.sql`
      INSERT INTO evergreen_read.integrations (
        id, project_id, goal_id, attempt, base_ref, base_sha, status, completion, aggregate_sequence, last_event_id,
        started_at, updated_at, resolves_integration_id
      )
      VALUES (
        ${integration.id}, ${integration.projectId}, ${integration.goalId}, ${integration.attempt}, ${integration.baseRef},
        ${integration.baseSha}, ${integration.status}, ${completion}::text::jsonb, ${event.aggregate.sequence}, ${event.eventId},
        ${event.occurredAt}, ${event.occurredAt}, ${integration.resolvesIntegrationId}
      )
      ON CONFLICT (id) DO UPDATE
      SET status = EXCLUDED.status, completion = EXCLUDED.completion, aggregate_sequence = EXCLUDED.aggregate_sequence,
          last_event_id = EXCLUDED.last_event_id, updated_at = EXCLUDED.updated_at
      WHERE evergreen_read.integrations.aggregate_sequence < EXCLUDED.aggregate_sequence
    `
  }

  async projectHandoffUpdated(event: EventEnvelope): Promise<void> {
    const { handoff } = handoffUpdatedPayloadSchema.parse(event.payload)
    await this.sql`
      INSERT INTO evergreen_read.handoffs (
        id, project_id, goal_id, integration_id, decision_id, plan, status, detail, result, aggregate_sequence,
        last_event_id, requested_at, updated_at
      )
      VALUES (
        ${handoff.id}, ${handoff.projectId}, ${handoff.goalId}, ${handoff.integrationId}, ${handoff.decisionId},
        ${JSON.stringify(handoff.plan)}::text::jsonb, ${handoff.status}, ${handoff.detail},
        ${handoff.result === null ? null : JSON.stringify(handoff.result)}::text::jsonb, ${event.aggregate.sequence},
        ${event.eventId}, ${event.occurredAt}, ${event.occurredAt}
      )
      ON CONFLICT (id) DO UPDATE
      SET status = EXCLUDED.status, detail = EXCLUDED.detail, result = EXCLUDED.result,
          aggregate_sequence = EXCLUDED.aggregate_sequence, last_event_id = EXCLUDED.last_event_id,
          updated_at = EXCLUDED.updated_at
      WHERE evergreen_read.handoffs.aggregate_sequence < EXCLUDED.aggregate_sequence
    `
  }

  async advanceFreshness(event: EventEnvelope): Promise<void> {
    await this.sql`
      INSERT INTO evergreen_read.projection_freshness (projection_name, event_id, occurred_at)
      VALUES (${"console"}, ${event.eventId}, ${event.occurredAt})
      ON CONFLICT (projection_name)
      DO UPDATE SET event_id = EXCLUDED.event_id, occurred_at = EXCLUDED.occurred_at, applied_at = now()
      WHERE EXCLUDED.occurred_at >= evergreen_read.projection_freshness.occurred_at
    `
  }

  async recordOffset(event: EventEnvelope, topic: string, partition: number, nextOffset: string): Promise<void> {
    await this.sql`
      INSERT INTO evergreen_read.consumer_offsets (consumer_name, topic, partition_id, next_offset, event_id)
      VALUES (${"evergreen-projection-v1"}, ${topic}, ${partition}, ${nextOffset}, ${event.eventId})
      ON CONFLICT (consumer_name, topic, partition_id)
      DO UPDATE SET next_offset = EXCLUDED.next_offset, event_id = EXCLUDED.event_id, updated_at = now()
    `
  }
}
