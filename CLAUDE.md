# evergreen-terrace

Personal engineering org for a one-person shop. The queue/conductor system below
is preserved legacy behavior. New work follows the approved local-first factory
contract in `specs/evergreen-v1/`; it must not extend the legacy shared-workspace
or direct-CLI lifecycle.

V1 uses a Compose control plane, a host-side capability bridge, isolated Git
worktrees, durable command/event state, and governed MCP clients. The hard
constraints are in `specs/evergreen-v1/OVERVIEW.md` and
`specs/evergreen-v1/ARCHITECTURE.md`.

## Workspace Layout

```
core/           Runtime apps — each must have a Bun.build() pipeline
packages/       Shared libraries (@evergreen-terrace/common, @evergreen-terrace/config)
services/       V1 independently deployable control-plane services
internal/       Private build tooling (@evergreen-terrace/build-utils)
agents/         Agent definitions — AGENT.md (instructions) + agent.json (config)
skills/         Knowledge bases read into agent system prompts
steering/       Global steering docs read by all agents
specs/          Legacy phase specs plus the approved v1 factory contract
integrations/   Archived integration domain guides
context/        Persistent state — project TOMLs, bead state, metrics, reports
queue/          Work items — inbox/ (pending) and active/ (in-flight)
docsite/        @bundt/dxdocs documentation site
```

## Service Ports

| Service       | Port |
|---------------|------|
| queue-server  | 2727 |
| web dashboard | 2728 |
| metrics       | 2729 |
| sentinel      | 2730 |
| conductor     | 2731 |
| v1 command API | 7410 |
| v1 read API | 7440 |

## Build Pipeline — Non-Negotiable

Every package in `core/` that has a runtime entry point MUST have a `Bun.build()` pipeline. Pattern:

```
package/
├── build/
│   ├── base.ts      createBaseConfig({ external: [...deps] })
│   └── index.ts     concurrent_build({ ...base, entrypoints, target: "bun", naming })
├── src/
│   └── index.ts
└── package.json     build: "bun build/index.ts"
```

`dev` scripts run source directly (`bun --watch src/index.ts`).
`build` scripts produce `dist/index.js` via `Bun.build()`.
Root scripts (`queue`, `sentinel`, `conductor`, etc.) run the compiled `dist/index.js`.

Failing to add a build pipeline to a new `core/` package is a defect.

## TypeScript — Do Not Weaken These Settings

All packages extend the root `tsconfig.json`. These settings must not be changed:

- `"module": "Preserve"` — not `"ESNext"`
- `"verbatimModuleSyntax": true` — use `import type` for type-only imports
- `"noUncheckedIndexedAccess": true` — array/object access bugs caught at compile time
- `"noImplicitOverride": true`
- `"moduleDetection": "force"`

## Path Resolution

Filesystem paths are resolved at runtime in entry points only, using `process.env.QUEUE_ROOT ?? process.cwd()`. Never use `import.meta.url`, `new URL(...)`, or `import.meta.dir` in shared config — they do not survive bundling.

## Shared Types — Single Source of Truth

`@evergreen-terrace/common` (`packages/common/`) owns all shared types (`QueueItem`, `QueueState`, config constants). No package duplicates these.

## Agent System

Agents live in `agents/{role}/`. Each has:
- `AGENT.md` — full instructions for that role
- `agent.json` — conductor config: model, allowed Claude Code tools, skills, steering refs

### Invoking an agent (conductor pattern)

The conductor builds a system prompt then calls Claude Code non-interactively:

```sh
claude -p "{prompt}" \
  --system-prompt "{AGENT.md + skills + steering concatenated}" \
  --model "{agent.json model}" \
  --allowedTools "{agent.json tools comma-separated}"
```

### System prompt assembly

`buildSystemPrompt(role)` in `core/conductor/src/prompt.ts` (Phase B):
1. Read `agents/{role}/AGENT.md`
2. For each skill in `agent.json skills[]`: read `skills/{skill}/SKILL.md`
3. For each steering doc in `agent.json steering[]`: read `steering/{doc}.md`
4. Concatenate with section headers

### Agent tool names (Claude Code)

`Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob` — these are the canonical Claude Code tool names used in `agent.json` and passed to `--allowedTools`.

## Agent Roles

| Role | Model | Purpose |
|------|-------|---------|
| `pm` | sonnet-4-6 | PRD generation, queue item authoring, backlog grooming |
| `eng-senior` | opus-4-7 | Architecture decisions, PR review, ADR authoring |
| `eng-mid` | sonnet-4-6 | Feature implementation from spec |
| `eng-junior` | sonnet-4-6 | Boilerplate, tests, scaffolding |
| `voice` | sonnet-4-6 | Rewrites output in Nick's register |
| `stakeholder` | sonnet-4-6 | Status updates in business language |
| `director` | sonnet-4-6 | Scope pressure, prioritization challenge |
| `momentum-sentinel` | sonnet-4-6 | Cross-project health scoring |

## Queue Item Schema

```toml
[item]
id = ""           # UUID
title = ""
project = ""      # from context/projects/
type = ""         # feature | bug | research | design | pm | ops
priority = ""     # p0 | p1 | p2 | p3
created = ""      # ISO datetime
source = ""       # manual | sentinel | jira | gitlab

[delegation]
agent = ""
delegated_at = ""

[context]
description = ""
acceptance = ""
links = []
```

## Bead Schema (conductor)

```toml
[bead]
id = "bead-{goal_id}-001"
goal_id = "goal-{uuid8}"
title = ""
role = ""         # WorkerRole
status = ""       # pending | in_progress | completed | failed
created = ""
started = ""
completed = ""

[task]
description = ""
acceptance = ""
context_files = []
output_files = []

[worker]
session_id = ""
```

Beads live in `context/beads/{goal_id}/`. All state is disk-backed — conductor restarts resume from disk.

## Agent Sync

Source of truth for agents lives in this repo (`agents/`, `skills/`, `steering/`). Changes are pushed to `~/.claude/agents/` via:

```sh
bun run sync-agents
```

This is also triggered automatically via a `PostToolUse` hook in `.claude/settings.json` whenever a file in `agents/`, `skills/`, or `steering/` is written or edited. The assembled agent file = AGENT.md body + skill files + steering docs, with Claude Code frontmatter (`name`, `description`, `model`, `tools`, `permissionMode`).

## Current direction

`PHASES.md` tracks the preserved legacy roadmap. The active factory direction is
the v1 contract under `specs/evergreen-v1/`. Build it additively: all writer
workers use factory-owned worktrees, protected branches remain immutable, and
the active checkout is never modified by the factory.

## Steering Docs

`steering/project-context.md` — who this is for and what agents should know about Nick
`steering/architecture-principles.md` — guiding principles for technical decisions
`steering/code-style.md` — code quality bar and formatting conventions
