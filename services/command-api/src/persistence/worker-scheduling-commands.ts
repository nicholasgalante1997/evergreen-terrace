/** @module Worker brief and scheduler-lease command transactions. */

import { createHash } from "node:crypto"
import { createWorkerBriefRecordedEvent, createWorkerLeaseEvent, createWorkerStateChangedEvent } from "@evergreen-terrace/contracts"
import type {
  EventEnvelope,
  WorkerBrief,
  WorkerLeaseAcquire,
  WorkerLeaseReconcile,
  WorkerLeaseRelease,
  WorkerLeaseRenew
} from "@evergreen-terrace/contracts"
import type { SQL } from "bun"
import { EventStore } from "./event-store"
import { OutboxRepository } from "./outbox-repository"
import {
  WorkerBriefConflictError,
  WorkerBriefNotFoundError,
  WorkerLeaseConflictError,
  WorkerNotFoundError
} from "./worker-error"
import { isLeaseLive } from "./worker-lease-guard"
import { WorkerRepository } from "./worker-repository"
import type {
  WorkerBriefResult,
  WorkerLeaseReconcileResult,
  WorkerLeaseReleaseResult,
  WorkerLeaseResult
} from "./command-database.types"
import type { WorkerRecord } from "./worker-repository.types"

const actor = { id: "command-api", kind: "system" } as const
const activeStates = new Set(["running", "awaiting_decision"])
const terminalStates = new Set(["completed", "failed", "cancelled"])

/** Command operations for one open transaction; every mutation is state + event + outbox. */
export class WorkerSchedulingCommands {
  readonly #events: EventStore
  readonly #outbox: OutboxRepository
  readonly #workers: WorkerRepository

  constructor(transaction: SQL) {
    this.#events = new EventStore(transaction)
    this.#outbox = new OutboxRepository(transaction)
    this.#workers = new WorkerRepository(transaction)
  }

  async recordBrief(workerId: string, brief: WorkerBrief): Promise<WorkerBriefResult> {
    const worker = await this.lock(workerId)
    const sha256 = createHash("sha256").update(brief.prompt).digest("hex")
    if (worker.briefSha256 !== null) {
      if (worker.briefSha256 !== sha256) {
        throw new WorkerBriefConflictError("A worker brief is immutable once recorded; prepare a new attempt instead")
      }
      const existing = await this.#workers.findBrief(workerId)
      if (existing === undefined) {
        throw new Error(`Worker ${workerId} records a brief digest without brief evidence`)
      }
      return { briefSha256: sha256, eventId: existing.recordedEventId, recorded: false, workerId }
    }
    if (worker.state !== "assigned") {
      throw new WorkerBriefConflictError(`Only an assigned worker can receive a brief; current state: ${worker.state}`)
    }
    const event = createWorkerBriefRecordedEvent({
      actor,
      briefLength: brief.prompt.length,
      briefSha256: sha256,
      causationId: worker.lastEventId,
      correlationId: crypto.randomUUID(),
      sequence: worker.sequence + 1,
      workerId
    })
    await this.#workers.recordBrief({ prompt: brief.prompt, recordedEventId: event.eventId, sha256, workerId }, worker.sequence + 1)
    await this.publish(event)
    return { briefSha256: sha256, eventId: event.eventId, recorded: true, workerId }
  }

  async getBrief(workerId: string) {
    const brief = await this.#workers.findBrief(workerId)
    if (brief === undefined) {
      throw new WorkerBriefNotFoundError(workerId)
    }
    return brief
  }

  async acquireLease(workerId: string, input: WorkerLeaseAcquire): Promise<WorkerLeaseResult> {
    const worker = await this.lock(workerId)
    const now = await this.#workers.databaseNow()
    if (isLeaseLive(worker, now)) {
      if (worker.leaseOwner === input.schedulerId) {
        return this.leaseResult(worker, false, null)
      }
      throw new WorkerLeaseConflictError(`Worker lease is held by ${String(worker.leaseOwner)}`)
    }
    if (worker.state !== "assigned") {
      throw new WorkerLeaseConflictError(`Only an assigned worker can be leased for launch; current state: ${worker.state}`)
    }
    if (worker.briefSha256 === null) {
      throw new WorkerLeaseConflictError("A worker requires a durable brief before it can be leased")
    }
    return this.writeLease(worker, "worker.lease_acquired", input.schedulerId, new Date(now.getTime() + input.ttlSeconds * 1_000))
  }

  async renewLease(workerId: string, input: WorkerLeaseRenew): Promise<WorkerLeaseResult> {
    const worker = await this.lock(workerId)
    const now = await this.#workers.databaseNow()
    if (worker.leaseOwner !== input.schedulerId) {
      throw new WorkerLeaseConflictError(`Worker lease is not held by ${input.schedulerId}`)
    }
    if (!isLeaseLive(worker, now)) {
      throw new WorkerLeaseConflictError("Worker lease expired; it must be reconciled, not renewed")
    }
    if (terminalStates.has(worker.state)) {
      throw new WorkerLeaseConflictError(`A ${worker.state} worker lease can only be released`)
    }
    return this.writeLease(worker, "worker.lease_renewed", input.schedulerId, new Date(now.getTime() + input.ttlSeconds * 1_000))
  }

  async releaseLease(workerId: string, input: WorkerLeaseRelease): Promise<WorkerLeaseReleaseResult> {
    const worker = await this.lock(workerId)
    if (worker.leaseOwner === null) {
      return { eventId: null, released: false, state: worker.state, workerId }
    }
    if (worker.leaseOwner !== input.schedulerId) {
      throw new WorkerLeaseConflictError(`Worker lease is held by ${worker.leaseOwner}`)
    }
    if (activeStates.has(worker.state)) {
      throw new WorkerLeaseConflictError(`Worker is ${worker.state}; record its outcome before releasing the lease`)
    }
    const event = createWorkerLeaseEvent({
      actor,
      causationId: worker.lastEventId,
      correlationId: crypto.randomUUID(),
      eventType: "worker.lease_released",
      sequence: worker.sequence + 1,
      worker: { lease: { owner: worker.leaseOwner } },
      workerId
    })
    await this.#workers.setLease(workerId, { eventId: event.eventId, expiresAt: null, owner: null, sequence: worker.sequence + 1 })
    await this.publish(event)
    return { eventId: event.eventId, released: true, state: worker.state, workerId }
  }

  /**
   * Clears an expired lease. A worker that was mid-session is failed rather
   * than relaunched: its ACP side effects are uncertain and are never replayed.
   */
  async reconcileLease(workerId: string, input: WorkerLeaseReconcile): Promise<WorkerLeaseReconcileResult> {
    const worker = await this.lock(workerId)
    const now = await this.#workers.databaseNow()
    if (worker.leaseOwner === null || worker.leaseExpiresAt === null) {
      return { eventIds: [], reconciled: false, state: worker.state, workerId }
    }
    if (isLeaseLive(worker, now)) {
      throw new WorkerLeaseConflictError(`Worker lease held by ${worker.leaseOwner} is still live`)
    }
    const expired = createWorkerLeaseEvent({
      actor,
      causationId: worker.lastEventId,
      correlationId: crypto.randomUUID(),
      eventType: "worker.lease_expired",
      sequence: worker.sequence + 1,
      worker: {
        lease: { expiredAt: worker.leaseExpiresAt.toISOString(), owner: worker.leaseOwner },
        reconciledBy: input.schedulerId,
        stateAtExpiry: worker.state
      },
      workerId
    })
    await this.#workers.setLease(workerId, { eventId: expired.eventId, expiresAt: null, owner: null, sequence: worker.sequence + 1 })
    await this.publish(expired)
    if (!activeStates.has(worker.state)) {
      return { eventIds: [expired.eventId], reconciled: true, state: worker.state, workerId }
    }
    const detail =
      `Lease held by ${worker.leaseOwner} expired at ${worker.leaseExpiresAt.toISOString()} while ${worker.state}. ` +
      "ACP session liveness cannot be proven, so the session is not replayed. Prepare a new attempt to retry."
    const failed = createWorkerStateChangedEvent({
      actor,
      causationId: expired.eventId,
      change: { detail, schedulerId: input.schedulerId, state: "failed" },
      correlationId: expired.correlationId,
      sequence: worker.sequence + 2,
      workerId
    })
    await this.#workers.transition(workerId, "failed", detail, failed.eventId, worker.sequence + 2)
    await this.publish(failed)
    return { eventIds: [expired.eventId, failed.eventId], reconciled: true, state: "failed", workerId }
  }

  private async writeLease(
    worker: WorkerRecord,
    eventType: "worker.lease_acquired" | "worker.lease_renewed",
    owner: string,
    expiresAt: Date
  ): Promise<WorkerLeaseResult> {
    const event = createWorkerLeaseEvent({
      actor,
      causationId: worker.lastEventId,
      correlationId: crypto.randomUUID(),
      eventType,
      sequence: worker.sequence + 1,
      worker: { lease: { expiresAt: expiresAt.toISOString(), owner } },
      workerId: worker.id
    })
    await this.#workers.setLease(worker.id, { eventId: event.eventId, expiresAt, owner, sequence: worker.sequence + 1 })
    await this.publish(event)
    return this.leaseResult({ ...worker, leaseExpiresAt: expiresAt, leaseOwner: owner }, true, event.eventId)
  }

  private leaseResult(worker: WorkerRecord, changed: boolean, eventId: string | null): WorkerLeaseResult {
    if (worker.leaseOwner === null || worker.leaseExpiresAt === null) {
      throw new Error(`Worker ${worker.id} has no lease to report`)
    }
    return {
      changed,
      eventId,
      leaseExpiresAt: worker.leaseExpiresAt.toISOString(),
      leaseOwner: worker.leaseOwner,
      workerId: worker.id
    }
  }

  private async lock(workerId: string): Promise<WorkerRecord> {
    const worker = await this.#workers.findByIdForUpdate(workerId)
    if (worker === undefined) {
      throw new WorkerNotFoundError(workerId)
    }
    return worker
  }

  private async publish(event: EventEnvelope): Promise<void> {
    await this.#events.append(event)
    await this.#outbox.enqueue(event)
  }
}
