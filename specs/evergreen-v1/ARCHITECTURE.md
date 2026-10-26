# Evergreen Terrace v1 architecture

## Topology

```text
Claude Code / Codex / KiroCrew / CLI / Jarvis console
                         |
                    MCP stdio + HTTP
                         |
Host bridge (host process)
  ACP sessions | Git/worktrees | gh | scoped filesystem capabilities
                         |
                 versioned authenticated contracts
                         |
Docker Compose control plane
  command API | PostgreSQL | outbox relay | Apache Kafka (KRaft)
  projection service | read API | live-event service | console AI agent
  React console
```

The host bridge is deliberately outside Docker. It is the only component allowed
to access local harness authentication, Git common directories, worktree roots,
and `gh`. Containers never receive a home-directory mount, credential store, or
Docker socket.

Every listed component is independently runnable. They communicate through
versioned HTTP/JSON or RPC contracts and durable events. Shared TypeScript
packages may contain schemas, domain types, and client interfaces, but not hidden
cross-service business logic.

## Service implementation boundaries

Service entry points are composition roots only: construct dependencies, connect
them, start the owned lifecycle objects, and coordinate shutdown. They do not
contain routes, raw SQL, polling loops, or consumer callbacks.

`@evergreen-terrace/service-runtime` provides the abstract `HttpServer`, which
extends `EventEmitter` and owns Bun transport startup/shutdown, health,
readiness, request lifecycle events, and the exception boundary. Each service
has a named subclass that owns only its domain routes.

`@evergreen-terrace/persistence` provides the abstract `PostgresDatabase` and
`PostgresRepository` bases. A database subclass owns one bounded connection
lifecycle and migration authority. Repository subclasses own focused queries;
the database class composes them into transactions. `new SQL`, transaction
creation, and migrations are forbidden from HTTP handlers and service entry
points.

## Command, event, and projection flow

The command API owns approvals, leases, goals, scheduler state, and policy
decisions. One PostgreSQL transaction writes:

1. The command-side state transition.
2. An immutable audit event.
3. An outbox record with the same immutable event identifier.

The outbox relay publishes committed records to Apache Kafka. Consumers are
idempotent by event identifier and build read projections. The console reads only
from the read API; it never queries command tables. Projection responses expose
the latest applied event identifier and timestamp so callers can see freshness.

Kafka is the durable replay and fan-out boundary. PostgreSQL is the strongly
consistent command authority. A single Postgres service contains separate command
and read databases, roles, and schemas.

Kafka events are JSON envelopes validated by shared Zod contracts and generated
JSON Schema. Events are versioned and compatibility-tested before publication.

## Worker and Git flow

The mayor turns a bounded goal into a durable contract, dependency graph, scope
claims, worker briefs, validation plan, and integration plan. A worker receives a
unique factory worktree whose path derives from canonical project ID, goal ID,
role, and attempt ID.

Goals sharing a repository use explicit scope claims and codebase/module analysis
to form a cross-goal graph. The console renders the graph and records operator
edits as planning events. A per-repository integration train composes completed
goal output in dependency order, revalidates it, and attaches shared evidence to
each goal's own feature-branch GitHub PR.

The integrator may select worker commits/diffs or create a clean replacement
implementation after review. In either case, source commits, diffs, rationale,
validation, and resulting commit provenance are durable evidence.

## MCP boundary

The MCP server is hand-rolled JSON-RPC 2.0. It supports stdio and loopback HTTP
through one dispatcher, static first-party registry, policy gate, and domain
client. It supports the current protocol and the approved legacy compatibility
path. External MCP SDKs are not permitted.

MCP exposes governed domain actions only. Arbitrary shell, filesystem, SQL,
prompt, and worktree primitives are prohibited. The implementation carries no
third-party MCP SDK dependency; the protocol boundary is owned and tested here.
`workspace.sync` is a governed tool that refreshes remote refs and GitHub
metadata but cannot alter the active checkout.

## Console and Jarvis

The browser uses only same-origin console APIs and WebSocket/SSE endpoints. The
console server is the authenticated MCP client; browser code never receives
host-bridge credentials.

The fixed console shell shows the goal contract, dependency graph, workers,
decisions, validation, diffs, timing/cost, and event stream. Jarvis is a separate,
configurable, read-only console agent. A user invokes it through a call to action
or chat. It may summarize, investigate, propose actions, and invoke governed
MCP actions subject to normal policy.

Jarvis may create temporary investigation workspaces from a trusted static panel
and data-source registry. It never rearranges the core operational shell. Every
claim links to event records, artifacts, worker outputs, prompts, plans, tool
calls, findings, and concise stated rationale. Hidden private reasoning is not an
artifact.

## Learning

Technical guardrails and policy are immutable. A private user profile may evolve
tone, verbosity, runner preferences, workflow habits, and general language or
framework conventions. Low-impact preferences promote from evidence automatically;
dependent or material changes require a decision.

Project-local behavior belongs in `.et` and is changed only through a normal
factory branch and PR/commit trail. Proven project-local preferences can be
proposed for promotion to the global profile.

## Operations

Compose owns service lifecycle, health checks, named networks, volumes, and local
service discovery. The user-facing lifecycle is `evergreen up`, `evergreen down`,
and `evergreen status`; a client may lazily start absent control-plane services.
Local recovery snapshots cover command state, Kafka data, artifacts, and `.et`
history before migrations and at defined recovery points. Remote backup is an
explicit future configuration.
