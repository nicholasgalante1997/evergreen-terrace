# Evergreen Terrace v1

## Status

**Approved architecture.** This document is the source of truth for v1 work. The
TOML queue, legacy conductor, and role-agent system remain in the repository as
historical, additive systems; v1 must not extend their lifecycle semantics.

Delivery slices 1-6 are implemented and have run live: the Compose control
plane, the host bridge and MCP transports, repository onboarding, mayor
planning, ACP execution with the scheduler and integration train, GitHub
handoff, the console, Jarvis, and local recovery snapshots. The v1 exit
criterion (two weeks of real use, slice 7) has not started. See
[`HANDOFF.md`](HANDOFF.md) for the evidence and the known gaps.

## Contract documents

- [Architecture and service map](ARCHITECTURE.md)
- [Event and HTTP API reference](EVENTS_AND_API.md)
- [Operations and recovery runbook](OPERATIONS.md)
- [Repository onboarding evidence](ONBOARDING.md)
- [Host bridge and MCP tools](HOST_BRIDGE.md)
- [Console and Jarvis](CONSOLE.md)
- [Implementation handoff and evidence](HANDOFF.md)
- [Agent operating instructions](AGENT_INSTRUCTIONS.md)
- [Decision record](DECISIONS.md)

## Product contract

Evergreen Terrace is a local-first engineering factory for one engineer. It
coordinates isolated worktree-based agent work, validates the resulting changes,
and gives the engineer a full operational console without requiring a new coding
harness.

V1 supports four concurrent goals across three to four workspaces, with three to
six workers per repository and up to twenty-four active ACP sessions when the
host and provider accounts allow it. The target operating cadence is five to ten
small goals per day.

The existing harnesses remain the entry points:

- Claude Code, Codex, and KiroCrew use governed MCP tools.
- The CLI is a reference and recovery client.
- The React console is a first-class harness and MCP consumer.

## Non-negotiable rules

- Every writing worker uses a factory-owned Git worktree. Evergreen never changes,
  stashes, resets, rebases, or pulls the engineer's active checkout.
- `main` and `dev` are protected by default. Evergreen cannot merge to protected
  branches.
- Claude Code and Codex run through ACP using existing plan authentication. V1
  does not silently substitute direct paid model APIs.
- The engine records durable state before invoking a side effect. Restart recovery
  observes and reconciles; it never blindly replays work.
- Destructive changes, migrations/schema changes, dependency or security changes,
  releases, credentials, and external side effects require a decision card.
- Git pushes, GitHub PRs, comments, and reviews are autonomous only on
  policy-permitted factory branches. GitHub integration uses `gh` first.
- There is no v1 artifact cleanup. Evidence, worktrees, events, and recovery
  material remain available.

## Repository contract

Each onboarded repository contains a strict, versioned `.et/config.toml`.
It is parsed with Zod, rejects unknown fields, and fails closed before onboarding
or goal launch. It declares the canonical remote (`origin` by default), protected
branches, allowed base refs, branch-class prefixes, validation commands, risk
policy, and goal-priority classes/weights.

The canonical remote is required for onboarding. A normal goal launch resolves an
explicit local base SHA only; it never fetches. `workspace.sync` is an explicit
MCP action which may fetch tracking refs and refresh GitHub metadata, but may not
modify the active checkout.

## Delivery slices

1. Compose service foundation, contracts, durable state, and recovery.
2. Host bridge plus governed stdio/HTTP MCP server.
3. Repository onboarding and `.et` validation.
4. ACP worker execution, scheduler, worktrees, and integration train.
5. GitHub handoff, console projection, and full React console.
6. Jarvis, the read-only configurable console agent and temporary investigation
   workspace composer.
7. Two weeks of continuous dogfooding in existing workspaces.

## V1 exit criterion

V1 is usable only after two weeks of day-over-day real use in existing workspaces
demonstrates faster goal progress and a higher release cadence. The proof includes
individually reviewable GitHub PRs, shared integration-train evidence, durable
recovery records, and correctly gated risky operations.
