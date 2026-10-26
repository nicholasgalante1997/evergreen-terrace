import { describe, expect, test } from "bun:test"
import {
  createDecisionRequestedEvent,
  createDecisionResolvedEvent,
  createGoalSubmittedEvent,
  createWorkerAssignedEvent,
  createWorkerStateChangedEvent,
  decisionRequestedPayloadSchema,
  decisionResolvedPayloadSchema,
  eventEnvelopeSchema,
  goalSubmittedPayloadSchema,
  workerAssignedPayloadSchema,
  workerBriefRecordedPayloadSchema,
  workerLeaseAcquireSchema,
  workerLeaseExpiredPayloadSchema,
  workerStateChangeSchema,
  workerStateChangedPayloadSchema
} from "./events"
import { createWorkerBriefRecordedEvent, createWorkerLeaseEvent } from "./events"

describe("event contracts", () => {
  test("creates a strict goal-submitted event", () => {
    const goalId = crypto.randomUUID()
    const event = createGoalSubmittedEvent({
      actor: { kind: "engineer", id: "nick" },
      goalId,
      sequence: 1,
      correlationId: crypto.randomUUID(),
      goal: {
        projectId: "github.com/nicholasgalante1997/evergreen-terrace",
        title: "Bootstrap the control plane",
        description: "Create the first durable services.",
        priorityClass: "p1",
        baseRef: "dev",
        baseSha: "a".repeat(40),
        idempotencyKey: "test-bootstrap",
        references: [],
        constraints: []
      }
    })

    expect(eventEnvelopeSchema.parse(event).eventType).toBe("goal.submitted")
    expect(goalSubmittedPayloadSchema.parse(event.payload).goal.id).toBe(goalId)
  })

  test("rejects unknown fields", () => {
    expect(() =>
      eventEnvelopeSchema.parse({
        eventId: crypto.randomUUID(),
        eventType: "goal.submitted",
        schemaVersion: 1,
        occurredAt: new Date().toISOString(),
        correlationId: crypto.randomUUID(),
        causationId: null,
        actor: { kind: "system", id: "test" },
        aggregate: { type: "goal", id: crypto.randomUUID(), sequence: 1 },
        payload: {},
        untrusted: true
      })
    ).toThrow()
  })

  test("preserves a decision-card lifecycle", () => {
    const decisionId = crypto.randomUUID()
    const correlationId = crypto.randomUUID()
    const decision = {
      category: "external_side_effect",
      context: "The factory needs approval before creating a pull request.",
      goalId: crypto.randomUUID(),
      idempotencyKey: "open-pr-goal-1",
      options: [
        { detail: "Create the pull request through gh.", id: "create", label: "Create pull request" },
        { detail: "Leave the branch local for later review.", id: "defer", label: "Defer" }
      ],
      projectId: "github.com/nicholasgalante1997/evergreen-terrace",
      recommendedOptionId: "create",
      title: "Create factory pull request"
    }
    const requested = createDecisionRequestedEvent({
      actor: { kind: "mayor", id: "mayor-1" },
      correlationId,
      decision,
      decisionId,
      sequence: 1
    })
    const resolved = createDecisionResolvedEvent({
      actor: { kind: "engineer", id: "nick" },
      causationId: requested.eventId,
      correlationId,
      decision,
      decisionId,
      resolution: { note: "Reviewed the aggregate diff.", selectedOptionId: "create", status: "approved" },
      sequence: 2
    })

    expect(decisionRequestedPayloadSchema.parse(requested.payload).decision.status).toBe("requested")
    expect(decisionResolvedPayloadSchema.parse(resolved.payload).decision.resolution.selectedOptionId).toBe("create")
    expect(eventEnvelopeSchema.parse(resolved).causationId).toBe(requested.eventId)
  })

  test("does not serialize persistence-only decision fields", () => {
    const decisionId = crypto.randomUUID()
    const storedDecision = {
      category: "security",
      context: "Review the requested dependency update.",
      createdAt: new Date(),
      goalId: null,
      idempotencyKey: "dependency-update",
      options: [{ detail: "Apply the reviewed update.", id: "apply", label: "Apply" }],
      projectId: "github.com/nicholasgalante1997/evergreen-terrace",
      recommendedOptionId: "apply",
      requestedEventId: crypto.randomUUID(),
      resolvedAt: null,
      resolvedEventId: null,
      resolution: null,
      status: "requested",
      title: "Approve dependency update"
    }
    const event = createDecisionResolvedEvent({
      actor: { kind: "engineer", id: "nick" },
      causationId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      decision: storedDecision,
      decisionId,
      resolution: { note: "Approved after review.", selectedOptionId: "apply", status: "approved" },
      sequence: 2
    })

    expect(event.payload.decision).not.toHaveProperty("createdAt")
    expect(event.payload.decision).not.toHaveProperty("requestedEventId")
  })

  test("preserves worker worktree provenance and lifecycle causation", () => {
    const workerId = crypto.randomUUID()
    const assigned = createWorkerAssignedEvent({
      actor: { id: "mayor-1", kind: "mayor" },
      causationId: null,
      correlationId: crypto.randomUUID(),
      sequence: 1,
      worker: {
        adapter: "codex",
        dependsOnWorkerIds: [],
        goalId: crypto.randomUUID(),
        idempotencyKey: "review-worker-1",
        projectId: "github.com/nicholasgalante1997/evergreen-terrace",
        role: "reviewer",
        worktree: {
          artifactDirectory: "/tmp/evergreen/artifacts/reviewer",
          attempt: 1,
          baseRef: "main",
          baseSha: "b".repeat(40),
          branch: "feature/et-reviewer",
          manifestPath: "/tmp/evergreen/records/reviewer/manifest.json",
          worktreePath: "/tmp/evergreen/worktrees/reviewer"
        }
      },
      workerId
    })
    const changed = createWorkerStateChangedEvent({
      actor: { id: workerId, kind: "worker" },
      causationId: assigned.eventId,
      change: { detail: "Review complete.", schedulerId: null, state: "completed" },
      correlationId: crypto.randomUUID(),
      sequence: 2,
      workerId
    })

    expect(workerAssignedPayloadSchema.parse(assigned.payload).worker.worktree.branch).toBe("feature/et-reviewer")
    expect(workerStateChangedPayloadSchema.parse(changed.payload).worker.state).toBe("completed")
    expect(changed.causationId).toBe(assigned.eventId)
  })

  test("keeps scheduler identity out of the state-changed payload", () => {
    const workerId = crypto.randomUUID()
    const change = workerStateChangeSchema.parse({ schedulerId: "host-bridge:xps:4242:abcd1234", state: "running" })
    const event = createWorkerStateChangedEvent({
      actor: { id: "host-bridge", kind: "system" },
      causationId: crypto.randomUUID(),
      change,
      correlationId: crypto.randomUUID(),
      sequence: 3,
      workerId
    })

    expect(workerStateChangedPayloadSchema.parse(event.payload).worker).toEqual({ detail: "", id: workerId, state: "running" })
  })

  test("records a brief by digest rather than prompt text", () => {
    const workerId = crypto.randomUUID()
    const event = createWorkerBriefRecordedEvent({
      actor: { id: "command-api", kind: "system" },
      briefLength: 42,
      briefSha256: "c".repeat(64),
      causationId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      sequence: 2,
      workerId
    })

    expect(workerBriefRecordedPayloadSchema.parse(event.payload).worker.briefSha256).toBe("c".repeat(64))
    expect(JSON.stringify(event.payload)).not.toContain("prompt")
  })

  test("bounds lease TTLs and validates lease lifecycle payloads", () => {
    const workerId = crypto.randomUUID()
    const expired = createWorkerLeaseEvent({
      actor: { id: "command-api", kind: "system" },
      causationId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      eventType: "worker.lease_expired",
      sequence: 5,
      worker: {
        lease: { expiredAt: new Date().toISOString(), owner: "host-bridge:a" },
        reconciledBy: "host-bridge:b",
        stateAtExpiry: "running"
      },
      workerId
    })

    expect(workerLeaseExpiredPayloadSchema.parse(expired.payload).worker.stateAtExpiry).toBe("running")
    expect(workerLeaseAcquireSchema.parse({ schedulerId: "host-bridge:a" }).ttlSeconds).toBe(90)
    expect(() => workerLeaseAcquireSchema.parse({ schedulerId: "host-bridge:a", ttlSeconds: 5 })).toThrow()
    expect(() => workerLeaseAcquireSchema.parse({ schedulerId: "bad id with spaces" })).toThrow()
    expect(() =>
      createWorkerLeaseEvent({
        actor: { id: "command-api", kind: "system" },
        causationId: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
        eventType: "worker.lease_acquired",
        sequence: 2,
        worker: { lease: { expiresAt: "not-a-date", owner: "host-bridge:a" } },
        workerId
      })
    ).toThrow()
  })
})
/** @module Event contract tests. */
