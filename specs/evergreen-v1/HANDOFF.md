/** @module Evergreen Terrace v1 implementation handoff. */

# Evergreen Terrace v1 implementation handoff

## Current status

Every v1 delivery slice except dogfooding is implemented and has run live
against Compose with real Claude ACP sessions:

- control plane, host bridge, worktrees, and decision cards;
- repository onboarding (cited discovery, a host-composed policy, one approval
  packet) and the first-goal gate;
- the mayor (bounded contract, scope-claimed tasks, dependency graph, worker
  briefs) and learned-preference promotion;
- the lease-based scheduler, the validation and integration train with
  scope-claim enforcement and the integrator agent, and the GitHub handoff;
- the console and Jarvis;
- local recovery snapshots.

What remains is the v1 exit criterion: two weeks of real use across three to
four workspaces (see "Remaining work").

The working tree is intentionally broad and dirty. Do not reset, checkout,
remove worktrees, delete Docker volumes, or clean `/tmp`/factory artifacts.

## Product decisions captured during discovery

The following are settled product decisions, not open design questions:

- Evergreen is a local-first factory for one engineer, not a distributed work
  platform and not a replacement coding harness.
- The primary experience is MCP from Claude Code, Codex, KiroCrew, CLI, and the
  eventual console. The CLI is a reference/recovery client, not the product.
- The host bridge runs natively because it needs Git common directories,
  worktrees, installed harness credentials, and `gh`; containers never receive
  a home-directory mount, credential store, checkout, or Docker socket.
- The control plane is Compose-managed. Kafka is the event broker; one Postgres
  service hosts strictly separated command/read databases, roles, and schemas.
- Events are strict, versioned JSON envelopes validated by shared Zod contracts.
  PostgreSQL command state is authoritative; Kafka is replay/fan-out; the read
  model is eventually consistent and exposes freshness.
- `main` and `dev` are protected defaults. Factory work happens in worktrees and
  feature/patch branches. The factory never merges protected branches.
- No normal artifact cleanup exists in v0/v1. Worktrees, logs, event evidence,
  failed registration records, and recovery material are intentionally kept.
- Network research is permitted to workers, but remote fetch is explicit through
  `workspace.sync`; ordinary goal launch resolves local refs only.
- Claude and Codex use installed plan authentication through ACP. Direct paid
  provider API-key fallback is prohibited.
- The MCP server is hand-rolled JSON-RPC 2.0 with stdio and HTTP transports.
  `@modelcontextprotocol` packages are categorically forbidden.
- Jarvis is neutral, mechanical, technical, read-only by default, and may never
  weaken guardrails. It can propose evolving tone/workflow preferences but not
  policy or technical safety boundaries.

## Repository map and ownership

| Path | Responsibility | Status |
| --- | --- | --- |
| `packages/contracts` | Zod event/command contracts and generated JSON schema | Implemented for goals, decisions, workers; lease contract incomplete. |
| `packages/service-runtime` | EventEmitter HTTP base, Bun listener, route registry | Implemented and refactored. |
| `packages/persistence` | OOP Postgres database/repository bases | Implemented. |
| `packages/project-policy` | Strict `.et/config.toml` parsing and branch/goal guards | Implemented. |
| `packages/mcp-core` | Owned MCP JSON-RPC dispatcher and tool registry | Implemented. |
| `services/command-api` | Strongly consistent commands, events, outbox | Implemented for current aggregates; scheduler lease vertical incomplete. |
| `services/outbox-relay` | Committed outbox publication to Kafka | Implemented. |
| `services/projection` | Kafka-to-read-model projection | Implemented for current event catalog. |
| `services/read-api` | Read-only projection queries/freshness | Implemented for goals, decisions, workers. |
| `services/host-bridge` | Native MCP, Git/worktrees, ACP, decisions | Implemented verticals; scheduler incomplete. |
| `core/*` | Historical legacy systems | Do not extend for v1 lifecycle semantics. |

## Implementation chronology and evidence

### Foundation and persistence

1. Added Compose topology, named volumes, health checks, service Dockerfile, and
   loopback exposure for command/read APIs only.
2. Created command state tables for goals, events, decisions, workers, and
   outbox. Worker rows include provenance, dependency IDs, lifecycle sequence,
   and newly added but unused scheduler lease columns.
3. Created read projection tables for goals, decisions, workers, applied events,
   offsets, and console freshness.
4. Implemented idempotent event application keyed by immutable event ID and
   transactional outbox relay publication.
5. Verified goal command -> outbox -> Kafka -> projection -> read API using
   preserved local fixture goals. Never delete these fixtures merely to make a
   future test look clean.

### HTTP/runtime refactor

1. Replaced linear route `if` chains in command and read APIs with
   `HttpRouteRegistry` and typed `:parameter` path templates.
2. Split command routes into goal, decision command/query, worker command/query,
   body parsing, and error translation modules.
3. Split host MCP HTTP transport into route composition, payload parsing,
   session storage, JSON-RPC response helpers, and request handling.
4. Split the common `HttpServer` into an EventEmitter server facade,
   `BunHttpListener`, and request responder. Health/readiness behavior remained
   transport-independent.
5. Tests cover template dispatch, duplicate routes, command parameterized route
   dispatch, MCP initialize/delete sessions, method failure, and health/ready
   semantics.

### Worktree and worker lifecycle

1. Worker preparation creates a detached factory worktree from a verified local
   base commit, switches to a generated policy-compliant factory branch, writes
   an atomic manifest, and then records durable assignment provenance.
2. If durable assignment registration fails after Git side effects, the bridge
   writes `worker-registration.failure.json` beside the manifest. It does not
   recreate or delete the worktree.
3. Worker lifecycle is guarded: `assigned -> running`, `running ->
   awaiting_decision|completed|failed|cancelled`, and decision wait may return to
   running. Terminal states cannot restart through lifecycle transition.
4. Dependencies are assignment-time, same-goal, backward-only worker IDs. This
   prevents forward-reference cycles while keeping dependency provenance durable.

### Permission and decision behavior

1. ACP commands confined to the worktree can be selected once only when they do
   not match the explicit destructive/external denylist.
2. Unknown tool calls, remote activity, risky Git operations, deployment,
   publishing, and persistent permission choices produce a decision card.
3. Permission events deliberately record only safe summaries, never raw action
   arguments that could contain secrets.
4. The decision resolver changes worker state to `awaiting_decision`, polls the
   strong command lookup, maps an approved one-time option back to ACP, and then
   returns the worker to `running`.

## Known fixture identifiers and preserved evidence

- Durable command-path fixture goal:
  `a6ca0886-59b9-46f2-81d0-a3f12d9c10fa`.
- Completed Claude verifier worker:
  `45c6250d-1a1d-4d0b-b9db-80616f4666f0`.
- Completed no-op worker fixture:
  `18edbde4-1802-49c3-b18c-ec04e003f05f`.
- Preserved approved permission decision:
  `2279a113-5885-4a11-96ef-f8709abcd2ab`.
- Codex adapter smoke evidence is under `/tmp/et-codex-adapter-proof-isolated-home`.
  Do not treat its prompt as a product fixture; it proves runtime initialization.

## Explicitly incomplete behavior and hazards

- The goal aggregate has only `goal.submitted`: its `state` stays `submitted`
  while plans, workers, integrations, and handoffs progress (Jarvis noticed
  this live). Progress lives on those aggregates.
- Cross-goal ordering is recorded, not enforced: overlapping claims between
  active goals appear on the plan card, and `integrateAfterGoalIds` is
  recorded, but the per-repository train still integrates each goal
  separately.
- The integrator resolves conflicts, but there is no hunk-level selection and
  no clean replacement implementation, and `validation_failed` has no repair
  path: rework means a new goal or attempt.
- Jarvis has no temporary investigation workspaces (spec: a static panel and
  data-source registry). It answers in its panel only.
- The console is not in Compose: it runs natively beside the bridge (see
  `OPERATIONS.md`).
- The schedule is implicit: it is the goal's briefed `assigned` workers, not a
  separate schedule aggregate. Per-schedule concurrency is passed at start time
  and is not persisted, so `evergreen.schedule.resume` takes it again.
- Legacy `running` workers with no lease (the pre-scheduler fixtures) still
  cannot be proven alive. They are reported `blocked` and are never
  auto-reconciled.
- The GitHub handoff pushes, opens or reuses the goal PR, and comments on a
  superseded PR. It does not request reviews, respond to review comments, or
  track PR state after creation; those require further governed capabilities.

## Contract-level implementation inventory

### Event envelope

`packages/contracts/src/events.ts` owns the strict envelope. All producers must
provide a UUID event ID, RFC 3339 timestamp, correlation ID, nullable causation
ID, typed actor, typed aggregate, schema version `1`, event type, and payload.
The command-side event store persists the envelope as JSONB and enforces unique
`aggregate_type`, `aggregate_id`, and aggregate sequence.

Current event names:

| Event | Producer | Consumer | Notes |
| --- | --- | --- | --- |
| `goal.submitted` | command API | projection/read API | Implemented. |
| `decision.requested` | command API | projection/read API | Implemented. |
| `decision.resolved` | command API | projection/read API | Implemented. |
| `worker.assigned` | command API | projection/read API | Implemented. |
| `worker.state_changed` | command API | projection/read API | Implemented. |
| `worker.brief_recorded` | command API | projection/read API | Implemented; digest and length only. |
| `worker.lease_acquired` / `worker.lease_renewed` | command API | projection/read API | Implemented. |
| `worker.lease_released` / `worker.lease_expired` | command API | projection/read API | Implemented. |
| `goal.priority_changed` | none | none | Reserved only. |
| `goal.dependency_changed` | none | none | Reserved only. |
| `worktree.created` | none | none | Reserved only. |
| `integration.updated` | command API | projection/read API | Implemented; `started` then one terminal status. |
| `validation.completed` | command API | projection/read API | Implemented; aggregate type `validation`. |
| `handoff.updated` | command API | projection/read API | Implemented; aggregate type `handoff`; body digest only. |
| `workspace.synced` | none | none | Reserved only. |

Every lease and handoff mutation already
uses the state + event + outbox transaction in
`services/command-api/src/persistence/worker-scheduling-commands.ts`.

### Goal contract

`goalSubmissionSchema` includes `projectId`, title, description, priority class,
base ref, exact local base SHA, idempotency key, references, and constraints.
The command API currently stores only the primary goal fields required by the
existing projection; references and constraints remain command input/evidence
and need a durable goal-contract model before mayor planning is implemented.

Goal submission is idempotent by `(project_id, idempotency_key)`. The bridge,
not an arbitrary external HTTP caller, derives project identity and base commit
from verified local Git state. The command API endpoint remains a diagnostic
surface; browser console code must use the read API.

### Decision contract

Decision cards are one-way state machines:

1. A request has project, optional goal, category, context, immutable options,
   optional recommendation, and idempotency key.
2. The command stores `requested`, event sequence one, and outbox record.
3. Resolution locks the row, validates selected option membership, writes the
   final resolution, event sequence two, and outbox record.
4. A repeat identical terminal resolution is idempotent; conflicting resolution
   fails.

The permission resolver uses this contract. It must not copy raw ACP command or
tool data into a decision context because those payloads can contain sensitive
values. It records a pointer to local artifacts instead.

### Worker assignment contract

Worker assignment includes:

- adapter (`claude` or `codex`);
- goal and project IDs;
- role and idempotency key;
- zero to sixteen unique dependency worker IDs;
- worktree path, artifact path, manifest path, base ref/SHA, branch, and attempt.

Dependencies are checked against the transaction's worker repository. A missing
dependency or one associated with another goal fails assignment. This gives a
simple acyclic, append-only graph because a new assignment can only reference
an earlier assignment.

### Worker state contract

The current legal transitions are deliberately small:

| From | Legal target states |
| --- | --- |
| `assigned` | `running`, `failed`, `cancelled` |
| `running` | `awaiting_decision`, `completed`, `failed`, `cancelled` |
| `awaiting_decision` | `running`, `failed`, `cancelled` |
| terminal | none |

The command transaction locks the aggregate before emitting a state event.
Duplicate submission of the current state returns existing evidence. The
command API enforces lease rules on every transition
(`worker-lease-guard.ts`). `assigned -> running` requires a live lease held by
the requesting `schedulerId`, and both `worker.run` and `worker_pool.run` now
launch only through `WorkerScheduler`.

## Service-by-service operational runbook

### Postgres

The single local service creates separate command/read database roles and
schemas. Command API migrations own `evergreen`; projection migrations own
`evergreen_read`; the read API must never acquire DDL authority. Normal factory
shutdown preserves all named volumes. Never use `docker compose down --volumes`
for a normal reset.

### Kafka and outbox relay

The `evergreen.events.v1` topic is initialized as a single-node KRaft topic.
The outbox relay reads only committed, unpublished rows. It records publication
attempts and errors, then marks a row published only after Kafka accepts it.
Projection consumers deduplicate by event ID before applying read-model state and
advance Kafka offsets transactionally with their local projection record.

### Command API

The command API uses route modules registered through `HttpRouteRegistry`.
Routes are grouped by goal, decision command/query, and worker command/query.
Handlers parse strict JSON, invoke the database facade, and map domain errors to
the common HTTP error shape. They do not contain raw SQL or migrations.

### Projection service

The projection service consumes Kafka from the beginning on first use, applies
known event payload schemas, persists source events, materializes read rows, and
updates the `console` freshness watermark. It currently has no handlers for
reserved events. Adding a new command event requires its projection behavior,
schema migration, and read API surface to land together.

### Read API

The read API exposes projected goals, decisions, workers, and freshness. It is
not strongly consistent. Console clients must render freshness rather than
claiming live state when Kafka/projection is behind.

### Host bridge

The bridge is started from the target repository. Its stdout is JSON-RPC only
for stdio. HTTP binds loopback only. It composes Git workspace inspection,
worktree manager, command client, execution service, worker pool, and MCP tool
registry. It is the only v1 component allowed to invoke Git, installed ACP
adapters, or `gh`.

## MCP tool inventory

| Tool | Implemented behavior | Missing behavior |
| --- | --- | --- |
| `evergreen.workspace.status` | Reads local Git/project state (credentials stripped from the remote URL). | None for v1. |
| `evergreen.workspace.sync` | Explicit fetch/prune and GitHub metadata refresh. | Durable sync event/projection. |
| `evergreen.goal.submit` | First-goal gate (policy committed at the base, unchanged, remote matches), then submits the durable goal contract. | Goal-state progression after submission. |
| `evergreen.decision.request` | Creates durable card. | None for v1. |
| `evergreen.decision.resolve` | Resolves durable card. | Action continuation ledger. |
| `evergreen.worktree.prepare` | Creates factory worktree/manifest. | Worktree-created event. |
| `evergreen.worker.prepare` | Creates worktree and durable assignment. | None for v1 (the mayor launches planned workers). |
| `evergreen.worker.run` | Records a brief; runs one worker under a lease. | None for this slice. |
| `evergreen.worker_pool.run` | Records briefs; starts a background lease-based schedule. | Persisted per-schedule concurrency. |
| `evergreen.schedule.status` | Goal workers with state, brief digest, and lease. | None for v1. |
| `evergreen.schedule.resume` | Reconciles expired leases and continues a goal. | Automatic resume on bridge start. |
| `evergreen.validation.run` | Captures and validates one completed worker's commit. | None for v1. |
| `evergreen.integration.run` | Per-goal train with conflict/overlap/diff evidence, exclusions, and scope-claim enforcement. | Hunk selection, clean replacement, enforced cross-goal order. |
| `evergreen.integration.status` | Goal integration attempts and validation records. | None for v1. |
| `evergreen.handoff.request` | Plans push + PR and creates the decision card. | None for v1. |
| `evergreen.handoff.execute` | Executes the approved plan with reconciliation. | Review requests and PR-state tracking. |
| `evergreen.handoff.status` | Goal handoffs with plan, result, and exact body. | None for v1. |
| `evergreen.integration.resolve` | Re-runs a conflicted attempt with the host-verified integrator agent. | Clean replacement implementation. |
| `evergreen.onboarding.discover` / `.apply` / `.status` | Cited read-only discovery, host-composed policy, one card; factory-branch commit. | None for v1. |
| `evergreen.plan.draft` / `.launch` / `.status` | Mayor plan with scope claims and graph; gated, idempotent launch. | Enforced cross-goal integration order. |
| `evergreen.preference.propose` / `.list` | Conservative promotion rules; material changes are cards. | Automatic proposal from observed behavior. |
| `evergreen.jarvis.ask` | Cited, read-only answers with schema-checked proposals. | Investigation workspaces. |

## ACP sandbox details

The runner invokes Bubblewrap with a read-only root and explicit writable binds
for the assigned worktree, the artifact directory, and worker-private temporary
directory. It changes directory to the worktree. It uses `--new-session` and
`--die-with-parent`; a host bridge exit terminates the adapter process.

Claude may use the existing `.claude` home state as currently mounted. Codex is
special-cased because shared runtime SQLite/WAL state is unsafe and failed inside
the namespace. Codex gets an artifact-local home, a read-only auth mount, and
no writable real `.codex` bind. Future security hardening should consider
isolating Claude runtime state by the same model after verifying its plan-auth
behavior.

The runner writes `acp.events.ndjson` and `acp.result.json`. Event logs include
session lifecycle updates and secret-safe permission summaries. They can still
contain agent-generated content, so console rendering must avoid treating them
as trusted HTML or copying them to event payloads.

## Proven verticals

### Control plane

- Compose topology: Postgres command/read databases, Kafka, command API, outbox
  relay, projection, and read API. See `compose.yaml` and `infra/`.
- Command transitions write aggregate state, immutable event, and transactional
  outbox record together.
- Kafka events use strict shared Zod contracts and idempotent read projections.
- Durable goals, decisions, worker assignments, and worker state transitions
  are implemented.

### Host bridge and worktrees

- Hand-rolled JSON-RPC MCP with stdio and loopback HTTP; no
  `@modelcontextprotocol` package is present.
- MCP tools include workspace status/sync, goal submission, decision
  request/resolve, worktree preparation, worker preparation/run, and bounded
  pool run. See `specs/evergreen-v1/HOST_BRIDGE.md`.
- Every prepared worker uses a factory-owned worktree. Protected branch and
  `.et/config.toml` policy checks are enforced before preparation.
- The worker assignment stores immutable worktree provenance and same-goal
  dependency IDs.

### ACP workers

- Claude ACP was proven end to end: assigned -> running -> awaiting_decision ->
  engineer approval -> running -> completed. The worktree stayed clean.
- Codex ACP is now proven with a real read-only session ending in `end_turn`.
  The prior failure was shared Codex SQLite/WAL/daemon state under `~/.codex`.
  Codex workers now use a worker-private `CODEX_HOME` in their artifact folder,
  a private `/tmp`, minimal Bubblewrap `/dev`, and a read-only mount of only the
  existing plan-auth `auth.json`.
- Relevant code:
  - `services/host-bridge/src/workers/acp-runner.ts`
  - `services/host-bridge/src/workers/worker-sandbox.ts`
  - `services/host-bridge/src/workers/codex-worker-home.ts`
  - `services/host-bridge/src/workers/adapter-runtime-environment.ts`

### Durable worker scheduler (completed slice)

The request-bound `WorkerPool` was replaced by `WorkerScheduler`. Design and
operator detail are in `HOST_BRIDGE.md` ("Durable worker scheduler") and
`EVENTS_AND_API.md` ("Worker leases").

| Layer | Files |
| --- | --- |
| Contracts | `packages/contracts/src/events.ts`: `schedulerIdSchema`, brief/lease input schemas, five new event payloads, `createWorkerBriefRecordedEvent`, `createWorkerLeaseEvent`. |
| Command | `worker-scheduling-commands.ts` (brief, acquire, renew, release, reconcile), `worker-lease-guard.ts` (transition rules), `worker_briefs` table and `brief_sha256` column, `worker-scheduling-routes.ts`. |
| Projection/read | Lease and brief columns on `evergreen_read.workers`; handlers for every new event. |
| Host | `worker-scheduler.ts`, `worker-lease-keeper.ts`, an abortable `AcpWorkerRunner`, `schedule-status-tool.ts`, `schedule-resume-tool.ts`. |

Key invariants:

- Launch needs a durable brief and a live lease.
- A refused renewal aborts the ACP session.
- Reconciling an expired lease on an active worker fails it and never replays
  the session.
- Brief text never enters a Kafka payload.
- The old unused `claimLease`/`releaseLease` scaffolding was removed.

Evidence:

- 7 scheduler tests use an in-memory command API that enforces the lease rules.
- 4 lease-guard unit tests.
- 3 contract tests.
- 3 PostgreSQL integration tests
  (`worker-scheduling.integration.test.ts`, gated on
  `ET_TEST_COMMAND_DATABASE_URL`, run against a disposable `postgres:17-alpine`).
- A projection replay of the resulting outbox, with duplicate delivery, matched
  command worker state exactly.

### Validation and integration train (completed slice)

Design and operator detail are in `HOST_BRIDGE.md` ("Validation and integration
train") and `EVENTS_AND_API.md` ("Integration train").

| Layer | Files |
| --- | --- |
| Policy | `[validation] setup` (network phase) and `timeout_seconds`; reserved `integration` role (`assertWorkerRole`). |
| Contracts | `packages/contracts/src/evidence-events.ts`: validation record, integration start/completion, refinements tying status to evidence, aggregate type `validation`. |
| Command | `evidence-commands.ts`, `evidence-repository.ts`, `evidence-routes.ts`, `GET /v1/goals/:goalId`; `validations` and `integrations` tables. |
| Projection/read | `evergreen_read.validations` and `evergreen_read.integrations`; `GET /v1/validations`, `GET /v1/integrations`. |
| Host | `git/factory-git.ts`, `validation/` (sandbox, runner, service), `integration/` (plan, train), and three tools. |

Two real defects were found and fixed while testing:

- **Sandbox mount order.** Both Bubblewrap sandboxes, including the existing
  ACP worker sandbox, bound the private `/tmp` after the worktree. Any worktree
  or artifact root under `/tmp` was hidden. `/tmp` is now mounted first, with a
  regression test.
- **Integration start payload.** `startIntegration` leaked `idempotencyKey`
  into a strict event payload. Strict contract validation rejected it, and the
  PostgreSQL test caught it.

Evidence:

- 5 integration-train tests on real Git repositories and worktrees with real
  Bubblewrap: dependency-ordered merge with capture, conflict abort, offline
  failing validation, unsettled-worker refusal, and timeout kill.
- 3 merge-plan tests and 4 evidence-contract tests.
- 3 PostgreSQL integration tests, re-runnable on one database.
- A projection replay across all 10 implemented event types, with duplicate
  delivery, matched command state.

### GitHub handoff (completed slice)

Design is in `HOST_BRIDGE.md` ("GitHub handoff") and `EVENTS_AND_API.md`
("GitHub handoff").

| Layer | Files |
| --- | --- |
| Contracts | `packages/contracts/src/handoff-events.ts`: plan, request, result, completion, `handoff.updated`, aggregate type `handoff`. |
| Command | `handoff-commands.ts` (atomic plan + decision card, approval gate, completion rules), `handoff-repository.ts`, `handoff-routes.ts`, `handoffs` table. |
| Projection/read | `evergreen_read.handoffs` (no body); `GET /v1/handoffs`. |
| Host | `github/` (`GitHubPort` with no merge; `GitHubCli`), `handoff/` (policy guard, body renderer, service), `FactoryGit.remoteBranchSha`/`pushCommit` (no force), and three tools. |

**Pre-existing defect found and fixed: JSONB stored as strings.** Every JSONB
write bound `JSON.stringify(x)` to a `::jsonb` parameter, which Bun encodes as
a JSON string scalar. All writers now use `::text::jsonb`, and both migrations
normalize existing rows.

That defect had made two earlier leak assertions vacuous: they filtered on
`envelope->…` and matched zero rows. They now assert the exact row count first.
The migration was exercised on a database holding 114 legacy string rows.

Evidence:

- 6 handoff tests on real Git with a local bare remote:
  - nothing external happens before approval;
  - a single push and a single PR after approval;
  - a declined card never contacts the remote;
  - crash recovery reconciles the push and PR;
  - a diverged remote branch fails the handoff without a force push;
  - a request is refused after the integration moved;
  - the supersede comment is posted once and recognized on retry.
- 3 body-renderer tests, including that no local path is disclosed.
- 3 contract tests.
- 3 PostgreSQL tests: the atomic card, approval gating, the failed-then-retried
  lifecycle, decline, the pushed-SHA check, and no body in the outbox.
- A replay of all 13 implemented event types through the real outbox-relay
  parser and projection matched command state.
- The built bridge lists all 17 tools over stdio.

### Live Compose exercise (completed, 2026-10-26)

The stack was rebuilt from this branch with the operator's new `.env`.

**Setup.** The `.env` passwords differed from those baked into the existing
`evergreen-postgres` volume. With the operator's approval, the four roles were
rotated in place (`ALTER ROLE … PASSWORD`, values passed by environment name
and never printed). A snapshot of both databases was taken first, under
`~/.local/state/evergreen-terrace/backups/<timestamp>-pre-v1-slices/`. Volumes
were preserved, and no data was lost: 4 goals, 3 workers, 4 decisions, and 23
events before and after. The JSONB migration converted 23 of 23 string-scalar
envelopes in both databases.

The run used a sandbox project (`github.com/nicholasgalante1997/et-sandbox`,
local bare origin, scratch factory root), real Claude ACP workers, Bubblewrap,
and Kafka. Its two goals remain in the command database as fixtures:
`ec0c062b-6c63-4993-b8fd-adfc853e2248` (validated integration, declined
handoff) and `e0906434-a080-4a64-bff6-dcf6a1c42510` (crash recovery).

**What was proven live:**

- **Scheduling and decisions.**
  - `worker_pool.run` returned immediately while the schedule ran in the
    background.
  - The dependent worker launched only after its prerequisite completed.
  - Each ACP file write raised a card, which the operator reviewed and resolved
    one at a time.
  - Leases kept renewing while a worker waited on a card. A worker's trail:
    `assigned`, `brief_recorded`, `lease_acquired`, `running`,
    `awaiting_decision`, several `lease_renewed`, `running`, `completed`,
    `lease_released`.
- **Integration.** `integration.run` captured the uncommitted output of both
  workers, merged them in dependency order, and passed validation in the
  sandbox (`validated`).
- **Crash recovery.**
  - The bridge was killed with `SIGKILL` mid-session.
  - Zero adapter processes survived in the crashed worktrees
    (`--die-with-parent`).
  - After restart, `schedule.resume` reconciled both expired leases:
    `worker.lease_expired` (`stateAtExpiry: running`, `reconciledBy` the new
    scheduler), then `failed`, with no second session.
- **Handoff.** `handoff.request` created the exact external-actions card, and
  `execute` was refused while the card was unresolved. After the decline,
  `execute` returned `declined`: nothing was pushed, no body file was written,
  and `gh` was never invoked.
- **Read side.** 92 command events, 92 projected events, and 0 unpublished.
  Projection lag was 156 ms, and no service logged an error.

**Defects fixed during the run:**

- The earlier session's edit to `.env.example` had dropped a comment marker,
  which made `docker compose` reject the copied `.env`. The header was restored
  in both files.
- The bridge treated a present-but-empty `ET_FACTORY_ROOT` (common in the
  auto-loaded `.env`) as the factory root, which would have created worktrees
  under relative paths. The lease TTL setting had the same flaw (`Number("")`
  is 0). Empty settings now count as unset, and the factory root must be
  absolute.

**Findings not yet addressed:**

- The permission card and its `acp.events.ndjson` summary don't say what is
  being requested (`subjectType: null` for Claude's requests). The operator has
  to dig the tool title and locations out of `session.update` records. A safe
  improvement: include the ACP tool kind and worktree-relative locations,
  never command text, in the summary and the card.
- On a hard kill, `AcpWorkerRunner`'s buffered event-log appends are lost. The
  crashed worker had no `acp.events.ndjson` at all, so durable proof that the
  session started exists only command-side.
- Two items were not observed live:
  - The "live foreign lease is reported blocked" path. Leases had already
    expired by the time of the first resume; it is covered by unit tests.
  - `GitHubCli` against real `gh`. That needs a scratch GitHub repository,
    which is the operator's choice.

### Permission card details (completed, 2026-10-26)

Cards and permission artifacts used to say only `subjectType: null`. The
parser read a `subject` field that ACP v1 does not have; requests carry
`toolCall`.

- **Now:** cards are built from `toolCall`. The title is
  `<role>: <kind> <location>`. Locations are worktree-relative, and any
  location outside the worktree is flagged. The agent's title appears only for
  file-only kinds. Command lines and URLs are never copied (see
  `HOST_BRIDGE.md`, "Permission cards").
- **Tests:** 5 tests use the request shape observed from `claude-agent-acp`,
  including that a credential-bearing command or URL never reaches the card or
  the artifact log.
- **Live:** a real card read `writer: edit notes/hello.md`. Rejecting it
  prevented the write.

**Finding (resolved by the next slice):** for the same reason, the old
automatic-approval policy never matched a real request.

**Finding:** an agent whose only edit was rejected still ended `completed`
(`end_turn`). Completion is not evidence that the work happened; validation and
the integrator's host-side checks are.

### Integrator agent (completed slice, 2026-10-26)

Design is in `HOST_BRIDGE.md` ("Integrator agent") and `EVENTS_AND_API.md`
("Integration train").

| Layer | Files |
| --- | --- |
| Contracts | Additive `resolvesIntegrationId`, `selection`, and `resolutions` (`integrationResolutionSchema`, `integrationSelectionSchema`). `IntegrationStartInput`/`IntegrationCompletionInput` let callers omit defaults. |
| Policy | Reserved `integrator` role. |
| Command | `evidence-commands.ts`: resolve-attempt, integrator, source, and exclusion rules; `integrations.resolves_integration_id`. |
| Projection/read | `resolves_integration_id` on `evergreen_read.integrations`. |
| Host | `integration/conflict-integrator.ts`, `integrator-brief.ts`, `workers/acp-transcript.ts`, the open-merge primitives in `FactoryGit`, selection in `IntegrationTrain`, the `evergreen.integration.resolve` tool, and PR-body disclosure of resolutions and exclusions. |

**Scope delivered:**

- Commit selection: whole-worker exclusion, with a rationale and dependency
  closure.
- Agent conflict resolution, verified by the host.

**Not delivered:**

- Hunk-level commit selection.
- A "clean replacement" re-implementation.
- Integrator repair of `validation_failed` attempts. Today these need rework
  and a new attempt.

**Evidence:**

- 7 new train tests on real Git:
  - a resolved conflict, as a two-parent merge, revalidated with its rationale
    recorded;
  - refusals for leftover markers, out-of-scope edits (including an attempt to
    edit `.et/config.toml`), and an agent that committed the merge itself;
  - refusal for an attempt that is not conflicted, and for a bridge without an
    integrator;
  - selection with rationale and stranding checks.
- 1 PR-body test and 2 contract tests, including that legacy events still parse.
- 3 PostgreSQL rule tests, run twice.
- A 148-event projection replay matched command state.

**Live (sandbox goal `792eb796-3cf6-4b10-b0c9-e4100b4bb52b`):**

- Two Claude workers rewrote the same README line, each after one card. The
  plain train recorded attempt 1 `conflicted`.
- `integration.resolve` opened attempt 2 with the merge left open (`UU
  README.md`). The real Claude integrator raised one card (`integrator: edit
  README.md`), was approved, and kept both lines.
- The host verified and committed a two-parent merge. Validation passed, and
  the rationale was recorded.
- The read API shows attempt 2 resolving attempt 1, with one resolution.
  158 command events, 158 projected events, 0 unpublished, and no service errors.

### Conservative command allowlist (completed, 2026-10-26)

The operator chose a conservative allowlist over cards for every command.
Design and the exact rules are in `HOST_BRIDGE.md` ("Automatic command
approval").

| Piece | Files |
| --- | --- |
| Policy | Optional `[permissions] auto_approve_validation_commands`, default `false`; this repository keeps it off. |
| Host | `shell-words.ts` (rejects anything with shell semantics), `command-allowlist.ts` (read-only programs, flag denials, confined paths that follow symlinks), and `worktree-permission-policy.ts` (ACP v1 `toolCall` for Claude scripts and Codex argv). It is wired through `WorkerExecutionService`, which reads policy before the worker starts. |
| Evidence | `permission.resolved` now records `via`, `granted`, and `rule` or `decisionId`, so automatic approvals are auditable. The old `subject` policy was removed. |

Test-runner auto-approval is limited to exact `.et` check commands behind the
opt-in. They run repository code with the worker sandbox's network access and
mounted plan credentials, so a general "test runner" rule was not added.

**Evidence:**

- 51 policy tests: 12 approvals and 33 must-never-approve cases, including git
  config injection, `-C`, `--ext-diff`, chaining, expansion, `~`, `/proc`,
  traversal, an in-worktree symlink to an outside file, an outside `cwd`,
  clustered or attached denied flags, and Codex argv carrying shell syntax.
- The full host suite (91 tests) passes.
- **Live (goal "Automatic approval check"):** a real Claude worker's `git status
  --short` was approved automatically (`via: automatic,
  rule: read_only:git-status`, no card). `cat /etc/hostname` raised a card
  titled `reader: execute /etc/hostname OUTSIDE the worktree`, with the command
  withheld; it was rejected. No command text appears in the artifact log.

### Real GitHub handoff (completed, 2026-10-26)

The operator logged `gh` in (account `nicholasgalante1997`, SSH protocol) and
approved the target. Setup:

- created private `nicholasgalante1997/et-sandbox`;
- pointed the sandbox origin at `git@gh-ng:nicholasgalante1997/et-sandbox.git`;
- pushed the base commit `90196d5` as `main`.

Then the integrator-resolved, validated attempt of goal
`792eb796-3cf6-4b10-b0c9-e4100b4bb52b` was handed off:

- `handoff.request` produced the exact external-actions card and a 2,248-character
  body. The operator approved that single card.
- `handoff.execute` (real `GitHubCli`) pushed `a4931f0` without force and opened
  **https://github.com/nicholasgalante1997/et-sandbox/pull/1**.
- GitHub reports the PR `OPEN`, not merged, base `main`, head `a4931f0`. Its body
  SHA-256 equals the approved digest, and it contains no local paths. It
  discloses the integrator's resolution and rationale.
- Events show `requested`, `executing`, `completed`, and the read model shows
  PR #1.
- The recovery observations ran against real GitHub with no side effects:
  `ls-remote` saw the pushed head, and `gh pr list --head` found PR #1, so a
  resumed execution would reconcile both steps. An unknown branch returns null.

**Not exercised live:** `gh pr comment`, the supersede path, which needs a
second handoff for the same goal. A re-run of a completed handoff returns its
stored result without contacting GitHub.

### Mayor, onboarding, console, Jarvis, and snapshots (completed, 2026-10-26)

Contracts: `plan.updated`, `onboarding.updated`, and `preference.updated`
(aggregate types `plan`, `onboarding`, `preference`), integration
`scopeViolations`, and a durable goal contract (`references`, `constraints`).
Command API: plan, onboarding, and preference aggregates, each creating its
decision cards atomically; preferences settle inside the decision-resolution
transaction. Projection and read API: `/v1/plans`, `/v1/onboardings`,
`/v1/preferences`, `/v1/events`. Host bridge: read-only ACP sessions, structured
output with repair turns, the mayor planner, onboarding, preferences, Jarvis,
the first-goal gate, and scope enforcement (27 tools). New packages:
`services/console` and `internal/recovery`. Details are in `HOST_BRIDGE.md`,
`EVENTS_AND_API.md`, `CONSOLE.md`, and `OPERATIONS.md`.

Live evidence against Compose. The sandbox clone lives in the session
scratchpad; a reboot that cleared `/tmp` is why it was re-cloned from GitHub.
A `pre-mayor` snapshot was taken before rebuilding.

- **Onboarding, revision 1** (`86009760`): two discovery agents and the mayor,
  all read-only, produced a packet with every check cited and four honest
  ambiguities. It exposed a real bug: Git metadata was invisible inside the
  sandbox for a repository under `/tmp` (agents saw `not a git repository`).
  Fixed by binding the Git common directory read-only in every sandbox, with
  a Bubblewrap regression test. The operator note requested a revision with
  answers, which declined the packet without committing anything.
- **Onboarding, revision 2** (`cbf759b4`): the note reached the agents
  verbatim. With Git visible they found the earlier goal's unmerged
  integration branch on origin and flagged deleting it as a `destructive` risk.
  Approved and applied: `feature/et-onboarding-cbf759b4` at `4464cb8` changes
  only `.et/config.toml`; the active checkout stayed on `main`, clean.
  Validation failed as the engineer said it would (the notes did not exist
  yet).
- **Mayor** (goal `478366b2`, plan `6851587b`): `goal.submit` passed the
  first-goal gate. The mayor returned two tasks (schema, then api), one file
  claimed by each. It recognized that a dependent worker cannot see its
  prerequisite's output and pinned the same Task definition word for word in
  both briefs. The approved plan launched both workers in dependency order;
  each raised one in-scope edit card, approved one at a time. Integration
  attempt `1606f6ed` merged schema then api with no scope violations and
  validated at `0757dbc`.
- **Console**: served the live snapshot, rendered every goal (verified by
  server-rendering each goal view from live data), streamed the watermark over
  SSE, and refused a foreign Host (421) and a cross-site action (403).
- **Jarvis**: answered "explain this goal" with claims citing real plan, worker,
  decision, integration, and validation IDs, and with honest missing evidence
  (it noticed the goal's `state` never advances). Its first proposal used the
  wrong argument (`goalId` for `handoff.request`). Fixed: proposals are now
  checked against each tool's real input schema, and the second answer
  proposed `{ integrationId }`. Clicking it through `/api/actions` created a
  handoff card, which was declined, and the console refused
  `handoff.execute`.
- **Snapshot** `20261026T154406Z-post-mayor-live` captured both databases, all
  233 topic messages (equal to the end offsets), factory records, and two
  `.et` histories, and passed `verify` (including `pg_restore --list`). The
  first attempt failed because Kafka 4.3 prints a deprecation notice on stdout,
  which made the count check report 234 of 233. It is marked `INCOMPLETE.txt`;
  the fix counts only message lines.
- **Operational finding**: rebuilding only command-api, projection, and
  read-api left a stale outbox relay that rejected `onboarding.updated` and
  stalled the ordered outbox. Nothing was lost, and a rebuilt relay drained it.
  `factory:up` rebuilds everything, and `OPERATIONS.md` now says so.

## Remaining work

1. **Dogfooding (the v1 exit criterion):** two weeks of day-over-day use across
   three to four real workspaces, measured against goal progress and release
   cadence. This needs the operator; it cannot be simulated. Start by merging
   this branch so Evergreen Terrace's own `.et/config.toml` reaches `main` and
   passes the first-goal gate.
2. Known gaps above: goal-state progression, enforced cross-goal train order,
   `validation_failed` repair and clean replacement, Jarvis investigation
   workspaces, and the supersede-comment path (still unexercised live).

## Quality conventions established in this branch

- Every TypeScript file has a `/** @module ... */` header.
- Server classes are composition roots. Route modules register with shared
  `HttpRouteRegistry`; do not reintroduce linear `if` route switchboards.
- Shared HTTP runtime uses `HttpServer` (EventEmitter), `BunHttpListener`, and
  typed route-template modules.
- Keep modules focused; current server roots are intentionally small.
- Persistence uses `PostgresDatabase`/`PostgresRepository` bases. Keep raw SQL
  out of handlers and composition roots.
- Preserve strict Zod contracts and TypeScript types in dedicated type files.
- No external MCP SDK/package may be added.

## Verification last run (2026-10-26)

- `bun run typecheck`: all 27 workspace packages passed.
- Builds passed for contracts, command-api, projection, read-api, host-bridge,
  and console. The legacy Tauri desktop build fails on this machine for lack
  of GTK development packages, which is unrelated and unchanged.
- Tests, all passing:
  - contracts 35, mcp-core 1, project-policy 3, service-runtime 5,
    outbox-relay 1, recovery 4, console 9;
  - command-api 24, including 18 PostgreSQL integration tests run twice
    against a disposable `postgres:17-alpine` (they skip without
    `ET_TEST_COMMAND_DATABASE_URL`);
  - host-bridge 145, including real Git, real Bubblewrap (a read-only mount and
    read-only Git metadata), and bare-remote handoff tests.
- Scans: no GitHub merge capability and no force-push flag in host-bridge
  source. The only `git merge` calls are local integration-worktree merges.
- `.et/config.toml` parses under the extended strict schema.
- `git diff --check` passed.
- Scans found no forbidden MCP package reference and no missing module headers
  in the v1 service/runtime sources.

## Operational note

The stack now runs this branch's images with the operator's `.env` (see "Live
Compose exercise"). Do not invent or commit passwords. To change them, follow
the rotation runbook in `OPERATIONS.md`. Never recreate the Postgres volume.
Rebuild every contract consumer together (command-api, outbox-relay,
projection, read-api); `bun run factory:up` does, after taking a `pre-up`
snapshot. A stale relay or projection rejects new event types under strict
envelope validation and stops.
