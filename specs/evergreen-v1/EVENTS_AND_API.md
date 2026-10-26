# Evergreen Terrace v1 event and API reference

## Contract ownership

`@evergreen-terrace/contracts` owns the versioned Zod contracts. Its public
surface is the only source of truth for command payloads and Kafka envelopes:

- `packages/contracts/src/events.ts` defines the runtime schemas and TypeScript
  types.
- `eventEnvelopeJsonSchema` provides the generated JSON Schema for consumers
  that cannot use TypeScript directly.
- Contracts are strict: unknown fields fail validation. Additive changes require
  a compatible schema-version strategy and consumer coverage before publication.

All timestamps are RFC 3339 UTC strings. Identifiers are UUIDs unless a field
explicitly names a Git object.

## Event envelope v1

Every event on `evergreen.events.v1` is JSON and validates as:

| Field | Meaning |
| --- | --- |
| `eventId` | Globally unique immutable event identifier. |
| `eventType` | A stable dot-separated domain event name. |
| `schemaVersion` | Envelope/payload contract version; currently `1`. |
| `occurredAt` | Time the command recorded the event. |
| `correlationId` | Trace identifier shared by one command flow. |
| `causationId` | The preceding event identifier, or `null` for a root command. |
| `actor` | Typed origin: engineer, Jarvis, mayor, worker, system, or MCP client. |
| `aggregate` | Aggregate type, UUID, and monotonic aggregate sequence. |
| `payload` | Event-specific strict payload. |

Event identifiers are the idempotency key for projection consumers. A consumer
persists the event application transactionally before committing the Kafka
offset. Duplicate delivery is expected and must be harmless.

## Event catalog

| Event | Status | Meaning |
| --- | --- | --- |
| `goal.submitted` | Implemented | A validated bounded goal entered command state. |
| `goal.priority_changed` | Reserved | A governed priority change. |
| `goal.dependency_changed` | Reserved | An integration-graph edge changed. |
| `decision.requested` / `decision.resolved` | Implemented | A decision card request and its one-way engineer resolution. |
| `worker.assigned` / `worker.state_changed` | Implemented | Worktree-backed worker assignment, immutable same-goal dependency edges, and guarded lifecycle state. |
| `worker.brief_recorded` | Implemented | An immutable worker brief was stored; the payload carries only its SHA-256 digest and length. |
| `worker.lease_acquired` / `worker.lease_renewed` | Implemented | A scheduler holds the worker lease until `expiresAt`. |
| `worker.lease_released` | Implemented | The owning scheduler released a lease after the worker settled. |
| `worker.lease_expired` | Implemented | Another scheduler reconciled an expired lease; `stateAtExpiry` records whether a session may have had side effects. |
| `worktree.created` | Reserved | Factory worktree provenance. |
| `integration.updated` | Implemented | Integration-train attempt: `started` (sequence 1), then one terminal status (`validated`, `validation_failed`, `conflicted`, or `blocked`) with full completion evidence (sequence 2). |
| `validation.completed` | Implemented | One immutable validation record (aggregate type `validation`) for a worker or integration commit. |
| `handoff.updated` | Implemented | GitHub handoff lifecycle (aggregate type `handoff`): `requested`, then `executing`, then `completed` or `failed` (a failed handoff may re-enter `executing`), or `declined`. Carries the plan with the body digest, never the body text. |
| `workspace.synced` | Reserved | Explicit remote-ref and GitHub metadata refresh. |

Reserved names are not a claim that their payload contracts or handlers exist.
They cannot be emitted until their payload schemas, command transaction, and
idempotent projection behavior land together. `decision.*` is no longer
reserved: its request and resolution are transactional outbox events and have
idempotent read-model projections. `worker.*` now uses the same path with a
per-worker aggregate sequence, immutable assignment provenance, and prerequisite
worker IDs. A dependency edge can name only an already-assigned worker from the
same goal, so the assignment graph cannot introduce a forward-reference cycle.

## Command API

The command API is loopback-only in the local Compose profile at
`http://127.0.0.1:7410`. It owns durable command state and never exposes a
database connection to a client.

### `POST /v1/goals`

Records a goal, its immutable `goal.submitted` event, and its outbox record in a
single PostgreSQL transaction.

```json
{
  "projectId": "github.com/example/repository",
  "title": "Bounded goal title",
  "description": "Scope and acceptance criteria",
  "priorityClass": "p1",
  "baseRef": "feature/et-example",
  "baseSha": "40-character-local-git-sha",
  "idempotencyKey": "caller-generated-stable-key",
  "references": ["optional durable reference"],
  "constraints": ["optional goal constraint"]
}
```

The host bridge derives `projectId`, `baseRef`, and `baseSha` from verified local
repository state after onboarding; callers must not treat this endpoint as a
policy bypass.

Responses are `{ "goalId", "eventId", "created" }`. The first successful
submission is `201` with `created: true`. A replay with the same
`projectId`/`idempotencyKey` returns the original identifiers with `200` and
`created: false`. Invalid JSON or a contract violation returns `400`.

### `GET /v1/goals`

Returns command-side goal summaries. `projectId` is an optional exact filter.
This endpoint is a command-side diagnostic surface; the console must use the
read API instead.

### `POST /v1/decisions`

Creates one immutable decision card, a `decision.requested` event, and an outbox
record atomically. A request supplies its project and optional goal, risk or
ambiguity category, technical context, one to eight bounded options, an optional
recommendation, and a per-project idempotency key. Its response is
`{ "decisionId", "eventId", "created", "status": "requested" }`.

### `POST /v1/decisions/:decisionId/resolve`

Records an `approved` or `rejected` decision. Approval requires a selected,
existing option. The command locks the requested decision, records one
`decision.resolved` event and outbox record, and refuses a conflicting later
resolution. Replaying the same final status returns its original evidence with
`resolved: false`.

### `GET /v1/decisions?projectId=<optional>`

Returns command-side decision summaries for diagnosis only.

### `POST /v1/workers`

Records a prepared worker assignment after the native bridge has created its
factory worktree. The input identifies the goal, role, Claude or Codex adapter,
idempotency key, zero to sixteen prerequisite worker IDs, and exact
worktree/branch/manifest/artifact provenance. The command verifies that the goal
exists in the same project and every prerequisite already belongs to that goal,
then atomically writes worker state, `worker.assigned`, and an outbox record.

### `GET /v1/workers/:workerId` and `GET /v1/decisions/:decisionId`

Return a command-side aggregate for the native execution engine. The bridge uses
these strongly consistent diagnostic lookups while a running ACP session waits
for an engineer decision; console clients remain read-API consumers.

### `POST /v1/workers/:workerId/state`

Transitions an assigned worker through `running`, `awaiting_decision`, and one
terminal state: `completed`, `failed`, or `cancelled`. The command locks the
aggregate and rejects an invalid or conflicting transition; a repeat of the
current state is idempotent and returns the existing event evidence.

The body accepts an optional `schedulerId`. `assigned -> running` requires a
live lease held by that scheduler. While a lease is live, every transition
except `cancelled` must name the lease owner. After a lease expires on an active
worker, only `failed`/`cancelled` are accepted until the lease is reconciled.
Lease refusals return `409 worker_lease_conflict`.

### `GET /v1/workers?projectId=<optional>`

Returns command-side worker summaries for diagnosis only.

### `POST /v1/workers/:workerId/brief` and `GET /v1/workers/:workerId/brief`

Records `{ "prompt" }` (1-40,000 characters) as the worker's immutable brief,
together with `worker.brief_recorded`. Only an `assigned` worker can receive a
brief. Repeating identical text returns the original evidence (`200`,
`recorded: false`); different text returns `409 worker_brief_conflict`. The
prompt text stays in command state and never enters a Kafka payload. `GET`
returns `{ workerId, prompt, sha256, recordedEventId }`, the scheduler's launch
input.

### Worker leases

All lease bodies name a `schedulerId` (`[A-Za-z0-9][A-Za-z0-9:._-]{0,127}`).
Expiry is judged by the command database clock.

| Route | Body | Behavior |
| --- | --- | --- |
| `POST /v1/workers/:workerId/lease` | `schedulerId`, `ttlSeconds` (15-600, default 90) | Acquires a lease for an `assigned`, briefed worker. Re-acquiring a live lease you already hold returns `changed: false`; a foreign live lease is `409`. |
| `POST /v1/workers/:workerId/lease/renew` | `schedulerId`, `ttlSeconds` | Extends a live lease held by the caller. An expired lease cannot be renewed. |
| `POST /v1/workers/:workerId/lease/release` | `schedulerId` | Clears the caller's lease. Refused while the worker is `running`/`awaiting_decision`. |
| `POST /v1/workers/:workerId/lease/reconcile` | `schedulerId` | Clears an expired lease (`worker.lease_expired`). An active worker is also failed in the same transaction, and its session is never replayed. Refused while the lease is live. |

### `GET /v1/goals/:goalId`

Returns one command-side goal, including its recorded `base_ref`/`base_sha`.

### `POST /v1/validations` and `GET /v1/goals/:goalId/validations`

Records one immutable validation and `validation.completed`:

- **Content:** subject (`worker` or `integration`), tested `commitSha`, start
  and finish times, artifact directory, and one to 48 per-command results.
  Each result has phase, exit code (`null` when killed), timeout flag,
  duration, and log paths.
- **Status:** must be `passed` exactly when every result exited `0` without
  timing out.
- **Subject:** must belong to the goal. An integration subject must still be
  `started`.
- **Idempotency:** keyed by `(projectId, idempotencyKey)`.

### Integration train

| Route | Behavior |
| --- | --- |
| `POST /v1/integrations` | Starts an attempt from `{ projectId, goalId, baseRef, baseSha, idempotencyKey, resolvesIntegrationId? }`. Base ref and SHA must equal the goal's recorded base. `resolvesIntegrationId`, when set, must name a `conflicted` attempt of the same goal. Attempts are allocated per goal under a goal row lock. Emits `integration.updated` (`started`). |
| `POST /v1/integrations/:integrationId/complete` | Records the terminal completion (see below). Repeating the same terminal status is idempotent; a different one is `409 evidence_conflict`. |
| `GET /v1/integrations/:integrationId` | Returns one attempt. |
| `GET /v1/goals/:goalId/integrations` | Returns every attempt for a goal in attempt order. |

The completion body carries:

- `status`
- the integration `branch`, worktree, and artifact paths
- `headSha`
- `mergeOrder`
- `sources`: each worker's branch, commit, optional capture commit, changed
  files, and insertions/deletions
- `overlaps`
- `conflict`, required exactly when `conflicted`
- `aggregateDiff` (path, SHA-256, stats)
- `validationId`, required exactly when `validated` or `validation_failed`
- `selection` (optional): `excludedWorkerIds` and a required `rationale`
- `resolutions` (default `[]`): per resolved conflict, the conflicted source,
  the `integrator` worker, paths, resolved merge commit, and the integrator's
  rationale with its SHA-256
- `detail`

`selection`, `resolutions`, and `resolvesIntegrationId` are additive with
defaults, so events recorded earlier still validate.

The command API also checks that:

- every source worker belongs to the goal, is `completed`, and is not an
  `integrator`;
- every excluded worker belongs to the goal and is not also a source;
- resolutions appear only on an attempt that resolves a conflicted one, name a
  completed `integrator` worker of the goal, and resolve a listed source;
- the validation's subject is this integration;
- the validation's commit equals `headSha`;
- `validated` corresponds to a passed validation.

### GitHub handoff

| Route | Behavior |
| --- | --- |
| `POST /v1/handoffs` | Plans a handoff from `{ integrationId, body, idempotencyKey, plan }`, where the plan holds `remote`, `repository`, `branch`, `headSha`, `baseRef`, `title`, and `supersedesPullRequest`. The command checks that the integration is `validated` and that the branch, head, and base match its evidence. It computes the body digest and atomically records the handoff (`requested`) and its `external_side_effect` decision card (options `approve`/`decline`). There is one handoff per integration. |
| `POST /v1/handoffs/:handoffId/begin` | Refused (`409`) while the card is unresolved. Approval with `approve` moves the handoff to `executing`; any other resolution moves it to `declined`. Calling it again while `executing` returns `resumed: true` for recovery, and a `failed` handoff may re-enter `executing` under the same approval. |
| `POST /v1/handoffs/:handoffId/complete` | `{ status: "completed", result, detail }` or `{ status: "failed", detail }`, accepted only while `executing`. `result.pushedSha` must equal the approved head. |
| `GET /v1/handoffs/:handoffId` and `GET /v1/goals/:goalId/handoffs` | Return the handoff, including the exact body. |

### `GET /v1/goals/:goalId/workers`

Returns full command-side worker records for one goal in assignment order,
including `briefSha256`, `leaseOwner`, and `leaseExpiresAt`. The scheduler plans
from this strongly consistent list.

## Read API

The read API is loopback-only at `http://127.0.0.1:7440`. Its PostgreSQL role
has `SELECT` permission only and enables read-only transactions.

### `GET /v1/goals?projectId=<optional>`

Returns the idempotently projected goals. Eventual consistency is intentional:
the response is current only through the projection watermark.

### `GET /v1/decisions?projectId=<optional>`

Returns projected cards, including immutable options, recommendation, resolution
when present, and requested/resolved timestamps. The console and all review
clients consume this endpoint rather than command tables.

### `GET /v1/workers?projectId=<optional>`

Returns projected workers with adapter, role, lifecycle state, latest state
detail, worktree/branch/manifest/artifact provenance, `brief_sha256`, and the
projected `lease_owner`/`lease_expires_at`. This is the console's worker
evidence surface. A projected lease is only as fresh as the projection
watermark, so the console must not use it to judge liveness.

### `GET /v1/validations`, `GET /v1/integrations`, and `GET /v1/handoffs` (`?projectId=<optional>`)

Return projected validation records, integration attempts with completion
evidence, and handoffs (plan, status, result; never the body) for console
review. Like every read endpoint they are current only
through the projection watermark.

### `GET /v1/projection/freshness`

Returns the current `console` projection watermark:

```json
{
  "freshness": {
    "projection_name": "console",
    "event_id": "uuid",
    "occurred_at": "2026-01-01T00:00:00.000Z",
    "applied_at": "2026-01-01T00:00:00.000Z"
  }
}
```

`freshness: null` means the projection has not applied an event. Clients should
render that state explicitly rather than imply real-time certainty.

## Error shape

HTTP errors use:

```json
{
  "error": {
    "code": "machine_readable_code",
    "message": "operator-readable summary",
    "details": []
  }
}
```

Errors contain validation metadata but never secret values. Service logs must
apply the same redaction rule.
