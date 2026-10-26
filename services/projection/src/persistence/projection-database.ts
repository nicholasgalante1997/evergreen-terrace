/** @module Read-model database transaction orchestration and schema authority. */

import { PostgresDatabase } from "@evergreen-terrace/persistence"
import type { EventEnvelope } from "@evergreen-terrace/contracts"
import { ProjectionRepository } from "./projection-repository"
import type { ProjectionDatabaseOptions } from "./projection-database.types"

const requirePostgresIdentifier = (name: string, value: string): string => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
    throw new Error(`${name} must be a simple PostgreSQL identifier`)
  }
  return value
}

export class ProjectionDatabase extends PostgresDatabase {
  readonly #readApiRole: string

  constructor(options: ProjectionDatabaseOptions) {
    super({ applicationName: "evergreen-projection", connectionLimit: 8, url: options.url })
    this.#readApiRole = requirePostgresIdentifier("ET_READ_API_DATABASE_USER", options.readApiRole)
  }

  async applyEvent(event: EventEnvelope, topic: string, partition: number, nextOffset: string): Promise<void> {
    await this.transaction(async (transaction) => {
      const projection = new ProjectionRepository(transaction)
      const inserted = await projection.recordEvent(event)
      if (inserted && event.eventType === "goal.submitted") {
        await projection.projectGoalSubmitted(event)
      }
      if (inserted && event.eventType === "decision.requested") {
        await projection.projectDecisionRequested(event)
      }
      if (inserted && event.eventType === "decision.resolved") {
        await projection.projectDecisionResolved(event)
      }
      if (inserted && event.eventType === "worker.assigned") {
        await projection.projectWorkerAssigned(event)
      }
      if (inserted && event.eventType === "worker.state_changed") {
        await projection.projectWorkerStateChanged(event)
      }
      if (inserted && event.eventType === "worker.brief_recorded") {
        await projection.projectWorkerBriefRecorded(event)
      }
      if (inserted && (event.eventType === "worker.lease_acquired" || event.eventType === "worker.lease_renewed")) {
        await projection.projectWorkerLeaseHeld(event)
      }
      if (inserted && (event.eventType === "worker.lease_released" || event.eventType === "worker.lease_expired")) {
        await projection.projectWorkerLeaseCleared(event)
      }
      if (inserted && event.eventType === "validation.completed") {
        await projection.projectValidationCompleted(event)
      }
      if (inserted && event.eventType === "integration.updated") {
        await projection.projectIntegrationUpdated(event)
      }
      if (inserted && event.eventType === "handoff.updated") {
        await projection.projectHandoffUpdated(event)
      }
      if (inserted && event.eventType === "plan.updated") {
        await projection.projectPlanUpdated(event)
      }
      if (inserted && event.eventType === "onboarding.updated") {
        await projection.projectOnboardingUpdated(event)
      }
      if (inserted && event.eventType === "preference.updated") {
        await projection.projectPreferenceUpdated(event)
      }
      await projection.advanceFreshness(event)
      await projection.recordOffset(event, topic, partition, nextOffset)
    })
  }

  protected async migrate(): Promise<void> {
    await this.sql.unsafe(`
      CREATE SCHEMA IF NOT EXISTS evergreen_read;

      CREATE TABLE IF NOT EXISTS evergreen_read.events (
        event_id UUID PRIMARY KEY, event_type TEXT NOT NULL, aggregate_type TEXT NOT NULL,
        aggregate_id UUID NOT NULL, occurred_at TIMESTAMPTZ NOT NULL, envelope JSONB NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS evergreen_read.goals (
        id UUID PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
        priority_class TEXT NOT NULL, base_ref TEXT NOT NULL, base_sha CHAR(40) NOT NULL,
        state TEXT NOT NULL, source_event_id UUID NOT NULL UNIQUE, submitted_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS evergreen_read.decisions (
        id UUID PRIMARY KEY,
        project_id TEXT NOT NULL,
        goal_id UUID,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        context TEXT NOT NULL,
        options JSONB NOT NULL,
        recommended_option_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('requested', 'approved', 'rejected')),
        resolution JSONB,
        requested_event_id UUID NOT NULL UNIQUE,
        resolved_event_id UUID,
        requested_at TIMESTAMPTZ NOT NULL,
        resolved_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CHECK (
          (status = 'requested' AND resolution IS NULL AND resolved_event_id IS NULL AND resolved_at IS NULL)
          OR (status IN ('approved', 'rejected') AND resolution IS NOT NULL AND resolved_event_id IS NOT NULL AND resolved_at IS NOT NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS read_decisions_project_status_idx
        ON evergreen_read.decisions (project_id, status, requested_at DESC);

      CREATE TABLE IF NOT EXISTS evergreen_read.workers (
        id UUID PRIMARY KEY,
        project_id TEXT NOT NULL,
        goal_id UUID NOT NULL,
        role TEXT NOT NULL,
        adapter TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        base_ref TEXT NOT NULL,
        base_sha CHAR(40) NOT NULL,
        branch TEXT NOT NULL,
        worktree_path TEXT NOT NULL,
        manifest_path TEXT NOT NULL,
        artifact_directory TEXT NOT NULL,
        depends_on_worker_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        state TEXT NOT NULL,
        state_detail TEXT NOT NULL DEFAULT '',
        assigned_event_id UUID NOT NULL UNIQUE,
        last_event_id UUID NOT NULL,
        assigned_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS read_workers_project_state_idx
        ON evergreen_read.workers (project_id, state, updated_at DESC);

      ALTER TABLE evergreen_read.workers
        ADD COLUMN IF NOT EXISTS depends_on_worker_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

      ALTER TABLE evergreen_read.workers
        ADD COLUMN IF NOT EXISTS brief_sha256 CHAR(64),
        ADD COLUMN IF NOT EXISTS lease_owner TEXT,
        ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS evergreen_read.validations (
        id UUID PRIMARY KEY,
        project_id TEXT NOT NULL,
        goal_id UUID NOT NULL,
        subject_type TEXT NOT NULL,
        subject_id UUID NOT NULL,
        commit_sha CHAR(40) NOT NULL,
        status TEXT NOT NULL,
        record JSONB NOT NULL,
        source_event_id UUID NOT NULL UNIQUE,
        completed_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS read_validations_project_idx
        ON evergreen_read.validations (project_id, completed_at DESC);

      CREATE TABLE IF NOT EXISTS evergreen_read.integrations (
        id UUID PRIMARY KEY,
        project_id TEXT NOT NULL,
        goal_id UUID NOT NULL,
        attempt INTEGER NOT NULL,
        base_ref TEXT NOT NULL,
        base_sha CHAR(40) NOT NULL,
        status TEXT NOT NULL,
        completion JSONB,
        aggregate_sequence INTEGER NOT NULL,
        last_event_id UUID NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      ALTER TABLE evergreen_read.integrations ADD COLUMN IF NOT EXISTS resolves_integration_id UUID;

      CREATE INDEX IF NOT EXISTS read_integrations_project_idx
        ON evergreen_read.integrations (project_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS evergreen_read.handoffs (
        id UUID PRIMARY KEY,
        project_id TEXT NOT NULL,
        goal_id UUID NOT NULL,
        integration_id UUID NOT NULL,
        decision_id UUID NOT NULL,
        plan JSONB NOT NULL,
        status TEXT NOT NULL,
        detail TEXT NOT NULL,
        result JSONB,
        aggregate_sequence INTEGER NOT NULL,
        last_event_id UUID NOT NULL,
        requested_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS read_handoffs_project_idx
        ON evergreen_read.handoffs (project_id, updated_at DESC);

      -- Plans, onboardings, and preferences keep their latest event payload whole; the console reads it as-is.
      CREATE TABLE IF NOT EXISTS evergreen_read.plans (
        id UUID PRIMARY KEY,
        project_id TEXT NOT NULL,
        goal_id UUID NOT NULL,
        status TEXT NOT NULL,
        state JSONB NOT NULL,
        aggregate_sequence INTEGER NOT NULL,
        last_event_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS read_plans_project_idx ON evergreen_read.plans (project_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS evergreen_read.onboardings (
        id UUID PRIMARY KEY,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL,
        state JSONB NOT NULL,
        aggregate_sequence INTEGER NOT NULL,
        last_event_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS evergreen_read.preferences (
        id UUID PRIMARY KEY,
        project_id TEXT,
        status TEXT NOT NULL,
        state JSONB NOT NULL,
        aggregate_sequence INTEGER NOT NULL,
        last_event_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS evergreen_read.projection_freshness (
        projection_name TEXT PRIMARY KEY, event_id UUID NOT NULL, occurred_at TIMESTAMPTZ NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS evergreen_read.consumer_offsets (
        consumer_name TEXT NOT NULL, topic TEXT NOT NULL, partition_id INTEGER NOT NULL,
        next_offset BIGINT NOT NULL, event_id UUID NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (consumer_name, topic, partition_id)
      );

      -- Earlier writers stored JSON as string scalars (see command-database normalizeJsonColumns).
      UPDATE evergreen_read.events SET envelope = (envelope #>> '{}')::jsonb WHERE jsonb_typeof(envelope) = 'string';
      UPDATE evergreen_read.decisions SET options = (options #>> '{}')::jsonb WHERE jsonb_typeof(options) = 'string';
      UPDATE evergreen_read.decisions SET resolution = (resolution #>> '{}')::jsonb WHERE jsonb_typeof(resolution) = 'string';
      UPDATE evergreen_read.workers SET depends_on_worker_ids = (depends_on_worker_ids #>> '{}')::jsonb
        WHERE jsonb_typeof(depends_on_worker_ids) = 'string';
      UPDATE evergreen_read.validations SET record = (record #>> '{}')::jsonb WHERE jsonb_typeof(record) = 'string';
      UPDATE evergreen_read.integrations SET completion = (completion #>> '{}')::jsonb WHERE jsonb_typeof(completion) = 'string';
      UPDATE evergreen_read.handoffs SET plan = (plan #>> '{}')::jsonb WHERE jsonb_typeof(plan) = 'string';
      UPDATE evergreen_read.handoffs SET result = (result #>> '{}')::jsonb WHERE jsonb_typeof(result) = 'string';

      GRANT USAGE ON SCHEMA evergreen_read TO ${this.#readApiRole};
      GRANT SELECT ON ALL TABLES IN SCHEMA evergreen_read TO ${this.#readApiRole};
      ALTER DEFAULT PRIVILEGES IN SCHEMA evergreen_read GRANT SELECT ON TABLES TO ${this.#readApiRole};
    `)
  }
}
