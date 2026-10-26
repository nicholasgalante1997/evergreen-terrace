/** @module Command database transaction orchestration and schema authority. */

import {
  createDecisionRequestedEvent,
  createDecisionResolvedEvent,
  createGoalSubmittedEvent,
  createWorkerAssignedEvent,
  createWorkerStateChangedEvent,
  decisionRequestSchema,
  decisionResolutionSchema,
  goalSubmissionSchema,
  handoffCompletionSchema,
  handoffRequestSchema,
  integrationCompletionSchema,
  integrationStartSchema,
  validationRecordSchema,
  workerAssignmentSchema,
  workerBriefSchema,
  workerLeaseAcquireSchema,
  workerLeaseReconcileSchema,
  workerLeaseReleaseSchema,
  workerLeaseRenewSchema,
  workerStateChangeSchema
} from "@evergreen-terrace/contracts"
import { PostgresDatabase } from "@evergreen-terrace/persistence"
import type {
  DecisionRequest,
  DecisionResolution,
  GoalSubmission,
  HandoffCompletion,
  HandoffRequest,
  IntegrationCompletionInput,
  IntegrationStartInput,
  ValidationRecord,
  WorkerAssignment,
  WorkerBrief,
  WorkerLeaseAcquire,
  WorkerLeaseReconcile,
  WorkerLeaseRelease,
  WorkerLeaseRenew,
  WorkerStateChange
} from "@evergreen-terrace/contracts"
import { DecisionConflictError, DecisionNotFoundError, DecisionResolutionError } from "./decision-error"
import { DecisionRepository } from "./decision-repository"
import { EventStore } from "./event-store"
import { EvidenceCommands } from "./evidence-commands"
import { EvidenceNotFoundError } from "./evidence-error"
import { IntegrationRepository, ValidationRepository } from "./evidence-repository"
import { HandoffCommands } from "./handoff-commands"
import { HandoffRepository } from "./handoff-repository"
import { GoalRepository } from "./goal-repository"
import { OutboxRepository } from "./outbox-repository"
import { WorkerAssignmentError, WorkerLeaseConflictError, WorkerNotFoundError, WorkerTransitionError } from "./worker-error"
import { leaseTransitionRefusal } from "./worker-lease-guard"
import { WorkerRepository } from "./worker-repository"
import { WorkerSchedulingCommands } from "./worker-scheduling-commands"
import { canTransitionWorkerState } from "./worker-state-transition"
import type {
  DecisionRequestResult,
  DecisionResolutionResult,
  GoalSubmissionResult,
  HandoffBeginResult,
  HandoffCompletionResult,
  HandoffRequestResult,
  IntegrationCompletionResult,
  IntegrationStartResult,
  ValidationRecordResult,
  WorkerAssignmentResult,
  WorkerBriefResult,
  WorkerLeaseReconcileResult,
  WorkerLeaseReleaseResult,
  WorkerLeaseResult,
  WorkerStateChangeResult
} from "./command-database.types"
import type { CommandDecisionSummary } from "./decision-repository.types"
import type { GoalSummary } from "./goal-repository.types"

export class CommandDatabase extends PostgresDatabase {
  constructor(url: string) {
    super({ applicationName: "evergreen-command-api", connectionLimit: 10, url })
  }

  async submitGoal(input: GoalSubmission): Promise<GoalSubmissionResult> {
    const goal = goalSubmissionSchema.parse(input)

    return this.transaction(async (transaction) => {
      const goalId = crypto.randomUUID()
      const event = createGoalSubmittedEvent({
        actor: { kind: "engineer", id: "goal-submission" },
        correlationId: crypto.randomUUID(),
        goal,
        goalId,
        sequence: 1
      })
      const goals = new GoalRepository(transaction)
      const created = await goals.create({
        baseRef: goal.baseRef,
        baseSha: goal.baseSha,
        createdEventId: event.eventId,
        description: goal.description,
        id: goalId,
        idempotencyKey: goal.idempotencyKey,
        priorityClass: goal.priorityClass,
        projectId: goal.projectId,
        title: goal.title
      })

      if (!created) {
        const existing = await goals.findByIdempotency(goal.projectId, goal.idempotencyKey)
        if (existing === undefined) {
          throw new Error("Idempotent goal submission was not persisted")
        }
        return { created: false, eventId: existing.createdEventId, goalId: existing.id }
      }

      await new EventStore(transaction).append(event)
      await new OutboxRepository(transaction).enqueue(event)
      return { created: true, eventId: event.eventId, goalId }
    })
  }

  async listGoals(projectId: string | null): Promise<GoalSummary[]> {
    return new GoalRepository(this.sql).list(projectId)
  }

  async getGoal(goalId: string): Promise<GoalSummary> {
    const goal = await new GoalRepository(this.sql).findById(goalId)
    if (goal === undefined) {
      throw new EvidenceNotFoundError(`Goal not found: ${goalId}`)
    }
    return goal
  }

  async requestDecision(input: DecisionRequest): Promise<DecisionRequestResult> {
    const request = decisionRequestSchema.parse(input)
    return this.transaction(async (transaction) => {
      const decisionId = crypto.randomUUID()
      const event = createDecisionRequestedEvent({
        actor: { id: "command-api", kind: "mcp_client" },
        correlationId: crypto.randomUUID(),
        decision: request,
        decisionId,
        sequence: 1
      })
      const decisions = new DecisionRepository(transaction)
      const created = await decisions.create({ id: decisionId, request, requestedEventId: event.eventId })
      if (!created) {
        const existing = await decisions.findByIdempotency(request.projectId, request.idempotencyKey)
        if (existing === undefined) {
          throw new Error("Idempotent decision request was not persisted")
        }
        return {
          created: false,
          decisionId: existing.id,
          eventId: existing.requestedEventId,
          status: "requested" as const
        }
      }
      await new EventStore(transaction).append(event)
      await new OutboxRepository(transaction).enqueue(event)
      return { created: true, decisionId, eventId: event.eventId, status: "requested" as const }
    })
  }

  async resolveDecision(decisionId: string, input: DecisionResolution): Promise<DecisionResolutionResult> {
    const resolution = decisionResolutionSchema.parse(input)
    return this.transaction(async (transaction) => {
      const decisions = new DecisionRepository(transaction)
      const decision = await decisions.findByIdForUpdate(decisionId)
      if (decision === undefined) {
        throw new DecisionNotFoundError(decisionId)
      }
      if (decision.status !== "requested") {
        if (decision.status === resolution.status && decision.resolvedEventId !== null) {
          return {
            decisionId,
            eventId: decision.resolvedEventId,
            resolved: false,
            status: decision.status
          }
        }
        throw new DecisionConflictError(decisionId, decision.status)
      }
      if (
        resolution.selectedOptionId !== null &&
        !decision.options.some((option) => option.id === resolution.selectedOptionId)
      ) {
        throw new DecisionResolutionError("selectedOptionId must identify one of the decision options")
      }
      const event = createDecisionResolvedEvent({
        actor: { id: "command-api", kind: "engineer" },
        causationId: decision.requestedEventId,
        correlationId: crypto.randomUUID(),
        decision,
        decisionId,
        resolution,
        sequence: 2
      })
      await decisions.resolve(decisionId, resolution, event.eventId)
      await new EventStore(transaction).append(event)
      await new OutboxRepository(transaction).enqueue(event)
      return { decisionId, eventId: event.eventId, resolved: true, status: resolution.status }
    })
  }

  async listDecisions(projectId: string | null): Promise<CommandDecisionSummary[]> {
    return new DecisionRepository(this.sql).list(projectId)
  }

  async getDecision(decisionId: string) {
    const decision = await new DecisionRepository(this.sql).findById(decisionId)
    if (decision === undefined) {
      throw new DecisionNotFoundError(decisionId)
    }
    return decision
  }

  async assignWorker(input: WorkerAssignment): Promise<WorkerAssignmentResult> {
    const worker = workerAssignmentSchema.parse(input)
    return this.transaction(async (transaction) => {
      const goalProjectId = await new GoalRepository(transaction).findProjectId(worker.goalId)
      if (goalProjectId === undefined) {
        throw new WorkerAssignmentError(`Goal not found: ${worker.goalId}`)
      }
      if (goalProjectId !== worker.projectId) {
        throw new WorkerAssignmentError("Worker projectId must match its goal")
      }
      const workers = new WorkerRepository(transaction)
      const dependencies = await Promise.all(worker.dependsOnWorkerIds.map((workerId) => workers.findById(workerId)))
      if (dependencies.some((dependency) => dependency === undefined)) {
        throw new WorkerAssignmentError("Worker dependencies must already exist")
      }
      if (dependencies.some((dependency) => dependency?.goalId !== worker.goalId)) {
        throw new WorkerAssignmentError("Worker dependencies must belong to the same goal")
      }
      const workerId = crypto.randomUUID()
      const event = createWorkerAssignedEvent({
        actor: { id: "command-api", kind: "system" },
        causationId: null,
        correlationId: crypto.randomUUID(),
        sequence: 1,
        worker,
        workerId
      })
      const created = await workers.create({ assignedEventId: event.eventId, id: workerId, worker })
      if (!created) {
        const existing = await workers.findByIdempotency(worker.projectId, worker.idempotencyKey)
        if (existing === undefined) {
          throw new Error("Idempotent worker assignment was not persisted")
        }
        return { created: false, eventId: existing.assignedEventId, state: "assigned" as const, workerId: existing.id }
      }
      await new EventStore(transaction).append(event)
      await new OutboxRepository(transaction).enqueue(event)
      return { created: true, eventId: event.eventId, state: "assigned" as const, workerId }
    })
  }

  async changeWorkerState(workerId: string, input: WorkerStateChange): Promise<WorkerStateChangeResult> {
    const change = workerStateChangeSchema.parse(input)
    return this.transaction(async (transaction) => {
      const workers = new WorkerRepository(transaction)
      const worker = await workers.findByIdForUpdate(workerId)
      if (worker === undefined) {
        throw new WorkerNotFoundError(workerId)
      }
      if (worker.state === change.state) {
        return { eventId: worker.lastEventId, state: worker.state, transitioned: false, workerId }
      }
      if (!canTransitionWorkerState(worker.state, change.state)) {
        throw new WorkerTransitionError(`Worker cannot transition from ${worker.state} to ${change.state}`)
      }
      const leaseRefusal = leaseTransitionRefusal(worker, change, await workers.databaseNow())
      if (leaseRefusal !== null) {
        throw new WorkerLeaseConflictError(leaseRefusal)
      }
      const event = createWorkerStateChangedEvent({
        actor: { id: "command-api", kind: "system" },
        causationId: worker.lastEventId,
        change,
        correlationId: crypto.randomUUID(),
        sequence: worker.sequence + 1,
        workerId
      })
      await workers.transition(workerId, change.state, change.detail, event.eventId, worker.sequence + 1)
      await new EventStore(transaction).append(event)
      await new OutboxRepository(transaction).enqueue(event)
      return { eventId: event.eventId, state: change.state, transitioned: true, workerId }
    })
  }

  async recordWorkerBrief(workerId: string, input: WorkerBrief): Promise<WorkerBriefResult> {
    const brief = workerBriefSchema.parse(input)
    return this.transaction((transaction) => new WorkerSchedulingCommands(transaction).recordBrief(workerId, brief))
  }

  async getWorkerBrief(workerId: string) {
    return new WorkerSchedulingCommands(this.sql).getBrief(workerId)
  }

  async acquireWorkerLease(workerId: string, input: WorkerLeaseAcquire): Promise<WorkerLeaseResult> {
    const lease = workerLeaseAcquireSchema.parse(input)
    return this.transaction((transaction) => new WorkerSchedulingCommands(transaction).acquireLease(workerId, lease))
  }

  async renewWorkerLease(workerId: string, input: WorkerLeaseRenew): Promise<WorkerLeaseResult> {
    const lease = workerLeaseRenewSchema.parse(input)
    return this.transaction((transaction) => new WorkerSchedulingCommands(transaction).renewLease(workerId, lease))
  }

  async releaseWorkerLease(workerId: string, input: WorkerLeaseRelease): Promise<WorkerLeaseReleaseResult> {
    const lease = workerLeaseReleaseSchema.parse(input)
    return this.transaction((transaction) => new WorkerSchedulingCommands(transaction).releaseLease(workerId, lease))
  }

  async reconcileWorkerLease(workerId: string, input: WorkerLeaseReconcile): Promise<WorkerLeaseReconcileResult> {
    const lease = workerLeaseReconcileSchema.parse(input)
    return this.transaction((transaction) => new WorkerSchedulingCommands(transaction).reconcileLease(workerId, lease))
  }

  async recordValidation(input: ValidationRecord): Promise<ValidationRecordResult> {
    const validation = validationRecordSchema.parse(input)
    return this.transaction((transaction) => new EvidenceCommands(transaction).recordValidation(validation))
  }

  async listGoalValidations(goalId: string) {
    return new ValidationRepository(this.sql).listByGoal(goalId)
  }

  async startIntegration(input: IntegrationStartInput): Promise<IntegrationStartResult> {
    const start = integrationStartSchema.parse(input)
    return this.transaction((transaction) => new EvidenceCommands(transaction).startIntegration(start))
  }

  async completeIntegration(integrationId: string, input: IntegrationCompletionInput): Promise<IntegrationCompletionResult> {
    const completion = integrationCompletionSchema.parse(input)
    return this.transaction((transaction) => new EvidenceCommands(transaction).completeIntegration(integrationId, completion))
  }

  async getIntegration(integrationId: string) {
    const integration = await new IntegrationRepository(this.sql).findById(integrationId)
    if (integration === undefined) {
      throw new EvidenceNotFoundError(`Integration not found: ${integrationId}`)
    }
    return integration
  }

  async listGoalIntegrations(goalId: string) {
    return new IntegrationRepository(this.sql).listByGoal(goalId)
  }

  async requestHandoff(input: HandoffRequest): Promise<HandoffRequestResult> {
    const request = handoffRequestSchema.parse(input)
    return this.transaction((transaction) => new HandoffCommands(transaction).request(request))
  }

  async beginHandoff(handoffId: string): Promise<HandoffBeginResult> {
    return this.transaction((transaction) => new HandoffCommands(transaction).begin(handoffId))
  }

  async completeHandoff(handoffId: string, input: HandoffCompletion): Promise<HandoffCompletionResult> {
    const completion = handoffCompletionSchema.parse(input)
    return this.transaction((transaction) => new HandoffCommands(transaction).complete(handoffId, completion))
  }

  async getHandoff(handoffId: string) {
    const handoff = await new HandoffRepository(this.sql).findById(handoffId)
    if (handoff === undefined) {
      throw new EvidenceNotFoundError(`Handoff not found: ${handoffId}`)
    }
    return handoff
  }

  async listGoalHandoffs(goalId: string) {
    return new HandoffRepository(this.sql).listByGoal(goalId)
  }

  async listGoalWorkers(goalId: string) {
    return new WorkerRepository(this.sql).listByGoal(goalId)
  }

  async listWorkers(projectId: string | null) {
    return new WorkerRepository(this.sql).list(projectId)
  }

  async getWorker(workerId: string) {
    const worker = await new WorkerRepository(this.sql).findById(workerId)
    if (worker === undefined) {
      throw new WorkerNotFoundError(workerId)
    }
    return worker
  }

  protected async migrate(): Promise<void> {
    await this.sql.unsafe(`
      CREATE SCHEMA IF NOT EXISTS evergreen;

      CREATE TABLE IF NOT EXISTS evergreen.goals (
        id UUID PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        priority_class TEXT NOT NULL,
        base_ref TEXT NOT NULL,
        base_sha CHAR(40) NOT NULL,
        idempotency_key TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'submitted',
        created_event_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (project_id, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS evergreen.events (
        event_id UUID PRIMARY KEY,
        event_type TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_id UUID NOT NULL,
        aggregate_sequence INTEGER NOT NULL,
        correlation_id UUID NOT NULL,
        causation_id UUID,
        occurred_at TIMESTAMPTZ NOT NULL,
        envelope JSONB NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (aggregate_type, aggregate_id, aggregate_sequence)
      );

      CREATE TABLE IF NOT EXISTS evergreen.decisions (
        id UUID PRIMARY KEY,
        project_id TEXT NOT NULL,
        goal_id UUID,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        context TEXT NOT NULL,
        options JSONB NOT NULL,
        recommended_option_id TEXT,
        idempotency_key TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('requested', 'approved', 'rejected')),
        requested_event_id UUID NOT NULL,
        resolution JSONB,
        resolved_event_id UUID,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (project_id, idempotency_key),
        CHECK (
          (status = 'requested' AND resolution IS NULL AND resolved_event_id IS NULL AND resolved_at IS NULL)
          OR (status IN ('approved', 'rejected') AND resolution IS NOT NULL AND resolved_event_id IS NOT NULL AND resolved_at IS NOT NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS decisions_project_status_idx
        ON evergreen.decisions (project_id, status, created_at DESC);

      CREATE TABLE IF NOT EXISTS evergreen.workers (
        id UUID PRIMARY KEY,
        project_id TEXT NOT NULL,
        goal_id UUID NOT NULL REFERENCES evergreen.goals(id),
        role TEXT NOT NULL,
        adapter TEXT NOT NULL CHECK (adapter IN ('claude', 'codex')),
        attempt INTEGER NOT NULL CHECK (attempt > 0),
        base_ref TEXT NOT NULL,
        base_sha CHAR(40) NOT NULL,
        branch TEXT NOT NULL,
        worktree_path TEXT NOT NULL,
        manifest_path TEXT NOT NULL,
        artifact_directory TEXT NOT NULL,
        depends_on_worker_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        idempotency_key TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('assigned', 'running', 'awaiting_decision', 'completed', 'failed', 'cancelled')),
        state_detail TEXT NOT NULL DEFAULT '',
        aggregate_sequence INTEGER NOT NULL CHECK (aggregate_sequence > 0),
        assigned_event_id UUID NOT NULL,
        last_event_id UUID NOT NULL,
        lease_owner TEXT,
        lease_expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (project_id, idempotency_key)
      );

      CREATE INDEX IF NOT EXISTS workers_project_state_idx
        ON evergreen.workers (project_id, state, created_at DESC);

      ALTER TABLE evergreen.workers
        ADD COLUMN IF NOT EXISTS depends_on_worker_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

      ALTER TABLE evergreen.workers
        ADD COLUMN IF NOT EXISTS lease_owner TEXT,
        ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

      ALTER TABLE evergreen.workers
        ADD COLUMN IF NOT EXISTS brief_sha256 CHAR(64);

      CREATE INDEX IF NOT EXISTS workers_goal_idx
        ON evergreen.workers (goal_id, created_at);

      CREATE TABLE IF NOT EXISTS evergreen.worker_briefs (
        worker_id UUID PRIMARY KEY REFERENCES evergreen.workers(id),
        prompt TEXT NOT NULL,
        sha256 CHAR(64) NOT NULL,
        recorded_event_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS evergreen.validations (
        id UUID PRIMARY KEY,
        project_id TEXT NOT NULL,
        goal_id UUID NOT NULL REFERENCES evergreen.goals(id),
        subject_type TEXT NOT NULL CHECK (subject_type IN ('worker', 'integration')),
        subject_id UUID NOT NULL,
        commit_sha CHAR(40) NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('passed', 'failed')),
        record JSONB NOT NULL,
        idempotency_key TEXT NOT NULL,
        completed_event_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (project_id, idempotency_key)
      );

      CREATE INDEX IF NOT EXISTS validations_goal_idx
        ON evergreen.validations (goal_id, created_at);

      CREATE TABLE IF NOT EXISTS evergreen.integrations (
        id UUID PRIMARY KEY,
        project_id TEXT NOT NULL,
        goal_id UUID NOT NULL REFERENCES evergreen.goals(id),
        attempt INTEGER NOT NULL CHECK (attempt > 0),
        base_ref TEXT NOT NULL,
        base_sha CHAR(40) NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('started', 'validated', 'validation_failed', 'conflicted', 'blocked')),
        completion JSONB,
        idempotency_key TEXT NOT NULL,
        aggregate_sequence INTEGER NOT NULL CHECK (aggregate_sequence > 0),
        last_event_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (project_id, idempotency_key),
        UNIQUE (goal_id, attempt),
        CHECK ((status = 'started') = (completion IS NULL))
      );

      ALTER TABLE evergreen.integrations
        ADD COLUMN IF NOT EXISTS resolves_integration_id UUID REFERENCES evergreen.integrations(id);

      CREATE TABLE IF NOT EXISTS evergreen.handoffs (
        id UUID PRIMARY KEY,
        project_id TEXT NOT NULL,
        goal_id UUID NOT NULL REFERENCES evergreen.goals(id),
        integration_id UUID NOT NULL UNIQUE REFERENCES evergreen.integrations(id),
        decision_id UUID NOT NULL UNIQUE REFERENCES evergreen.decisions(id),
        plan JSONB NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('requested', 'executing', 'completed', 'failed', 'declined')),
        detail TEXT NOT NULL DEFAULT '',
        result JSONB,
        idempotency_key TEXT NOT NULL,
        aggregate_sequence INTEGER NOT NULL CHECK (aggregate_sequence > 0),
        last_event_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (project_id, idempotency_key),
        CHECK ((status = 'completed') = (result IS NOT NULL))
      );

      CREATE TABLE IF NOT EXISTS evergreen.outbox (
        id BIGSERIAL PRIMARY KEY,
        event_id UUID NOT NULL UNIQUE REFERENCES evergreen.events(event_id),
        topic TEXT NOT NULL,
        partition_key TEXT NOT NULL,
        envelope JSONB NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL,
        published_at TIMESTAMPTZ,
        publish_attempts INTEGER NOT NULL DEFAULT 0 CHECK (publish_attempts >= 0),
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS outbox_unpublished_idx
        ON evergreen.outbox (id)
        WHERE published_at IS NULL;
    `)
    await this.normalizeJsonColumns()
  }

  /**
   * Earlier writers bound JSON text to a jsonb parameter, which Bun's driver
   * encodes as a JSON *string* scalar. Readers parse both forms, but SQL-level
   * JSON queries saw only strings. Unwrapping is lossless and idempotent.
   */
  private async normalizeJsonColumns(): Promise<void> {
    const columns = [
      ["events", "envelope"],
      ["outbox", "envelope"],
      ["decisions", "options"],
      ["decisions", "resolution"],
      ["workers", "depends_on_worker_ids"],
      ["validations", "record"],
      ["integrations", "completion"],
      ["handoffs", "plan"],
      ["handoffs", "result"]
    ] as const
    for (const [table, column] of columns) {
      await this.sql.unsafe(
        `UPDATE evergreen.${table} SET ${column} = (${column} #>> '{}')::jsonb WHERE jsonb_typeof(${column}) = 'string'`
      )
    }
  }
}
