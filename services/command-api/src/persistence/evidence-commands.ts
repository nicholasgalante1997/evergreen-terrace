/** @module Validation and integration-train command transactions. */

import { createIntegrationUpdatedEvent, createValidationCompletedEvent } from "@evergreen-terrace/contracts"
import type { EventEnvelope, IntegrationCompletion, IntegrationStart, ValidationRecord } from "@evergreen-terrace/contracts"
import type { SQL } from "bun"
import { EventStore } from "./event-store"
import { EvidenceConflictError, EvidenceNotFoundError } from "./evidence-error"
import { IntegrationRepository, ValidationRepository } from "./evidence-repository"
import { OutboxRepository } from "./outbox-repository"
import { WorkerRepository } from "./worker-repository"
import type { IntegrationCompletionResult, IntegrationStartResult, ValidationRecordResult } from "./command-database.types"
import type { IntegrationRecord } from "./evidence-repository.types"

const actor = { id: "command-api", kind: "system" } as const

/** Role of the agent that resolves integration conflicts; it is never an integration source. */
export const integratorRole = "integrator"

const identity = (integration: IntegrationRecord) => ({
  attempt: integration.attempt,
  baseRef: integration.baseRef,
  baseSha: integration.baseSha,
  goalId: integration.goalId,
  id: integration.id,
  projectId: integration.projectId,
  resolvesIntegrationId: integration.resolvesIntegrationId
})

/** Command operations for one open transaction; every mutation is state + event + outbox. */
export class EvidenceCommands {
  readonly #events: EventStore
  readonly #integrations: IntegrationRepository
  readonly #outbox: OutboxRepository
  readonly #validations: ValidationRepository
  readonly #workers: WorkerRepository

  constructor(transaction: SQL) {
    this.#events = new EventStore(transaction)
    this.#integrations = new IntegrationRepository(transaction)
    this.#outbox = new OutboxRepository(transaction)
    this.#validations = new ValidationRepository(transaction)
    this.#workers = new WorkerRepository(transaction)
  }

  async recordValidation(validation: ValidationRecord): Promise<ValidationRecordResult> {
    const existing = await this.#validations.findByIdempotency(validation.projectId, validation.idempotencyKey)
    if (existing !== undefined) {
      return { created: false, eventId: existing.completedEventId, status: existing.status, validationId: existing.id }
    }
    const goal = await this.#integrations.lockGoal(validation.goalId)
    if (goal === undefined || goal.projectId !== validation.projectId) {
      throw new EvidenceNotFoundError(`Goal ${validation.goalId} not found in project ${validation.projectId}`)
    }
    await this.assertSubject(validation)
    const validationId = crypto.randomUUID()
    const event = createValidationCompletedEvent({ actor, correlationId: crypto.randomUUID(), validation, validationId })
    if (!(await this.#validations.create(validationId, validation, event.eventId))) {
      throw new Error("Concurrent validation with the same idempotency key")
    }
    await this.publish(event)
    return { created: true, eventId: event.eventId, status: validation.status, validationId }
  }

  async startIntegration(input: IntegrationStart): Promise<IntegrationStartResult> {
    const existing = await this.#integrations.findByIdempotency(input.projectId, input.idempotencyKey)
    if (existing !== undefined) {
      return { attempt: existing.attempt, created: false, eventId: existing.lastEventId, integrationId: existing.id, status: existing.status }
    }
    const goal = await this.#integrations.lockGoal(input.goalId)
    if (goal === undefined || goal.projectId !== input.projectId) {
      throw new EvidenceNotFoundError(`Goal ${input.goalId} not found in project ${input.projectId}`)
    }
    if (goal.baseRef !== input.baseRef || goal.baseSha.toLowerCase() !== input.baseSha.toLowerCase()) {
      throw new EvidenceConflictError("An integration must start from its goal's recorded base ref and SHA")
    }
    if (input.resolvesIntegrationId !== null) {
      const resolved = await this.#integrations.findById(input.resolvesIntegrationId)
      if (resolved?.goalId !== input.goalId) {
        throw new EvidenceNotFoundError(`Integration ${input.resolvesIntegrationId} does not belong to goal ${input.goalId}`)
      }
      if (resolved.status !== "conflicted") {
        throw new EvidenceConflictError(`Only a conflicted integration can be resolved; ${resolved.id} is ${resolved.status}`)
      }
    }
    const record = {
      attempt: await this.#integrations.nextAttempt(input.goalId),
      baseRef: input.baseRef,
      baseSha: input.baseSha,
      goalId: input.goalId,
      id: crypto.randomUUID(),
      projectId: input.projectId,
      resolvesIntegrationId: input.resolvesIntegrationId
    }
    const event = createIntegrationUpdatedEvent({
      actor,
      causationId: null,
      correlationId: crypto.randomUUID(),
      integration: { ...record, status: "started" },
      sequence: 1
    })
    await this.#integrations.create({
      ...record,
      idempotencyKey: input.idempotencyKey,
      lastEventId: event.eventId,
      sequence: 1
    })
    await this.publish(event)
    return { attempt: record.attempt, created: true, eventId: event.eventId, integrationId: record.id, status: "started" }
  }

  async completeIntegration(integrationId: string, completion: IntegrationCompletion): Promise<IntegrationCompletionResult> {
    const integration = await this.#integrations.findByIdForUpdate(integrationId)
    if (integration === undefined) {
      throw new EvidenceNotFoundError(`Integration not found: ${integrationId}`)
    }
    if (integration.status !== "started") {
      if (integration.status === completion.status) {
        return { completed: false, eventId: integration.lastEventId, integrationId, status: integration.status }
      }
      throw new EvidenceConflictError(`Integration ${integrationId} already ended ${integration.status}`)
    }
    await this.assertSources(integration, completion)
    await this.assertValidation(integration, completion)
    const event = createIntegrationUpdatedEvent({
      actor,
      causationId: integration.lastEventId,
      correlationId: crypto.randomUUID(),
      integration: { ...identity(integration), completion, status: completion.status },
      sequence: integration.sequence + 1
    })
    await this.#integrations.complete(integrationId, completion, event.eventId, integration.sequence + 1)
    await this.publish(event)
    return { completed: true, eventId: event.eventId, integrationId, status: completion.status }
  }

  private async assertSubject(validation: ValidationRecord): Promise<void> {
    if (validation.subject.type === "worker") {
      const worker = await this.#workers.findById(validation.subject.id)
      if (worker?.goalId !== validation.goalId) {
        throw new EvidenceNotFoundError(`Worker ${validation.subject.id} does not belong to goal ${validation.goalId}`)
      }
      return
    }
    const integration = await this.#integrations.findById(validation.subject.id)
    if (integration?.goalId !== validation.goalId) {
      throw new EvidenceNotFoundError(`Integration ${validation.subject.id} does not belong to goal ${validation.goalId}`)
    }
    if (integration.status !== "started") {
      throw new EvidenceConflictError(`Integration ${integration.id} already ended ${integration.status}`)
    }
  }

  private async assertSources(integration: IntegrationRecord, completion: IntegrationCompletion): Promise<void> {
    const sourceIds = new Set(completion.sources.map((source) => source.workerId))
    for (const source of completion.sources) {
      const worker = await this.goalWorker(integration, source.workerId, "Integration source")
      if (worker.role === integratorRole) {
        throw new EvidenceConflictError(`Integrator worker ${worker.id} cannot be an integration source`)
      }
      if (worker.state !== "completed") {
        throw new EvidenceConflictError(`Integration source ${source.workerId} is ${worker.state}, not completed`)
      }
    }
    for (const excludedId of completion.selection?.excludedWorkerIds ?? []) {
      await this.goalWorker(integration, excludedId, "Excluded worker")
      if (sourceIds.has(excludedId)) {
        throw new EvidenceConflictError(`Worker ${excludedId} is both excluded and integrated`)
      }
    }
    if (completion.resolutions.length > 0 && integration.resolvesIntegrationId === null) {
      throw new EvidenceConflictError("Only an attempt that resolves a conflicted integration may carry resolutions")
    }
    for (const resolution of completion.resolutions) {
      const integrator = await this.goalWorker(integration, resolution.integratorWorkerId, "Integrator")
      if (integrator.role !== integratorRole || integrator.state !== "completed") {
        throw new EvidenceConflictError(`Worker ${integrator.id} is not a completed integrator`)
      }
      if (!sourceIds.has(resolution.conflictedWorkerId)) {
        throw new EvidenceConflictError(`Resolved worker ${resolution.conflictedWorkerId} is not an integration source`)
      }
    }
  }

  private async goalWorker(integration: IntegrationRecord, workerId: string, label: string) {
    const worker = await this.#workers.findById(workerId)
    if (worker?.goalId !== integration.goalId) {
      throw new EvidenceConflictError(`${label} ${workerId} does not belong to goal ${integration.goalId}`)
    }
    return worker
  }

  private async assertValidation(integration: IntegrationRecord, completion: IntegrationCompletion): Promise<void> {
    if (completion.validationId === null) {
      return
    }
    const validation = await this.#validations.findById(completion.validationId)
    if (validation === undefined || validation.subject.type !== "integration" || validation.subject.id !== integration.id) {
      throw new EvidenceConflictError(`Validation ${completion.validationId} is not evidence for integration ${integration.id}`)
    }
    if (completion.headSha === null || validation.commitSha.toLowerCase() !== completion.headSha.toLowerCase()) {
      throw new EvidenceConflictError("Integration validation must cover the integration head commit")
    }
    if ((validation.status === "passed") !== (completion.status === "validated")) {
      throw new EvidenceConflictError(`Integration status ${completion.status} contradicts validation status ${validation.status}`)
    }
  }

  private async publish(event: EventEnvelope): Promise<void> {
    await this.#events.append(event)
    await this.#outbox.enqueue(event)
  }
}
