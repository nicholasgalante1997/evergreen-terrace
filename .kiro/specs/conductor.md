# Spec: core/conductor

## Purpose

Gastown-inspired orchestrator for parallel agent execution. Nick describes a goal, the conductor breaks it into beads (atomic tasks), dispatches them to parallel agent workers, and manages the merge queue to prevent collisions. Git-backed state survives session restarts.

## Package

`@evergreen-terrace/conductor` at `core/conductor/`

Same build pipeline pattern as other `core/` packages.

## Concepts

**Bead** — an atomic unit of work. A TOML file with a task description, acceptance criteria, assigned worker role, and status. Stored in `context/beads/`.

**Mayor** — the orchestrator. Receives a goal from Nick, breaks it into beads, assigns roles, tracks completion.

**Polecat** — an ephemeral worker. Picks up a bead, executes it via `kiro agent run {role}`, marks the bead complete or failed.

**Refinery** — the merge queue. Ensures parallel polecats don't produce conflicting changes. Beads that touch the same files are serialized.

**Witness** — health monitor. Detects stalled polecats and re-queues their beads.

## Bead Schema

```toml
[bead]
id = "bead-abc-001"
goal_id = "goal-xyz"          # Parent goal
title = "Implement VelocityChart component"
role = "eng-mid"              # Which agent role handles this
status = "pending"            # pending | in_progress | completed | failed
created = "2026-05-08T10:00:00.000Z"
started = ""
completed = ""

[task]
description = "..."
acceptance = "..."
context_files = []            # Files the worker should read
output_files = []             # Files the worker is expected to produce/modify

[worker]
session_id = ""               # Kiro session ID when in_progress
```

## Bead Persistence

```
context/beads/
├── {goal_id}/
│   ├── goal.toml             # Goal description and status
│   ├── bead-001.toml
│   ├── bead-002.toml
│   └── bead-003.toml
```

All state is on disk. If the conductor crashes, the next session reads the bead files and resumes.

## HTTP API

Port `2731`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/conductor/goal` | Submit a goal `{ description: string }` |
| `GET` | `/conductor/goals` | List all goals and their bead status |
| `GET` | `/conductor/goal/:id` | Goal detail with all beads |
| `POST` | `/conductor/bead/:id/retry` | Re-queue a failed bead |

## Goal Submission Flow

1. Nick submits a goal via `POST /conductor/goal`
2. Mayor calls `kiro agent run eng-senior` with the goal — eng-senior produces a structured task breakdown
3. Mayor parses the breakdown into bead TOML files
4. Mayor identifies parallelism — beads with no shared `output_files` can run concurrently
5. Polecats are spawned (one per bead, up to `MAX_CONCURRENT` limit)
6. Each polecat runs `kiro agent run {role}` with the bead context
7. Refinery serializes beads that share output files
8. Witness polls polecat health every 60s — re-queues beads with stalled sessions

## Config additions to @evergreen-terrace/common

```ts
conductor: {
  server: { port: 2731 },
  maxConcurrent: 3,
}
```

## Nondeterministic Idempotence

Beads have acceptance criteria, not deterministic replay. If a bead fails and is retried, the worker may take a different approach — what matters is that the acceptance criteria are met, not that the same steps are followed.

## Acceptance Criteria

- `POST /conductor/goal` with a description returns a goal ID and triggers bead creation
- Beads are written to `context/beads/{goal_id}/` as TOML files
- Parallel beads (no shared output files) are dispatched concurrently up to `maxConcurrent`
- Beads that share output files are serialized via the Refinery
- A failed bead can be retried via `POST /conductor/bead/:id/retry`
- If the conductor restarts, it resumes in-progress goals from disk state
- `GET /conductor/goals` shows current goal and bead status
- Build pipeline produces `dist/index.js` via `Bun.build()`
