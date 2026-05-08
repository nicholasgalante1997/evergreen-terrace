# evergreen-terrace

Personal engineering org for a one-person shop operating at principal scope.

The bottleneck isn't access or management — it's team support. evergreen-terrace provides the PM, design, and engineering team that should exist but doesn't. Role-scoped agents handle the work that would otherwise fall to a full team. A persistent work queue tracks everything. A momentum sentinel surfaces what's going stale before it becomes a problem.

## What's Here

| Directory | Description |
|-----------|-------------|
| `core/queue-server/` | Work queue HTTP server (port 2727) |
| `core/tui/` | Terminal dashboard |
| `core/web/` | Vite/React web dashboard with metrics views (port 2728) |
| `core/metrics/` | Metrics collection service (port 2729) |
| `core/sentinel/` | Cron runner for momentum sentinel (port 2730) |
| `core/conductor/` | Parallel agent orchestrator — Mayor/Polecat/Refinery/Witness (port 2731) |
| `core/desktop/` | Tauri v2 native macOS app wrapping the web dashboard |
| `packages/config/` | Shared TypeScript configs (`@evergreen-terrace/config`) |
| `packages/common/` | Shared types and config constants (`@evergreen-terrace/common`) |
| `internal/build-utils/` | `createBaseConfig` and `concurrent_build` for `Bun.build()` pipelines |
| `agents/` | Kiro agent definitions (pm, eng-senior, eng-mid, eng-junior, voice, stakeholder, director, momentum-sentinel) |
| `skills/` | Shared knowledge bases (nick-voice, nick-conventions, springfield-context, fidget-context, agent-os-domain) |
| `steering/` | Global steering docs read by all agents |
| `integrations/` | Jira, GitLab, Figma MCP setup guides |
| `context/` | Persistent project state (TOML) |
| `queue/` | Work items — inbox (pending) and active (in-flight) |
| `docsite/` | Documentation site (`@bundt/dxdocs`) |

## Requirements

- Bun `>=1.3.13`
- Kiro CLI
- Rust + Cargo (for `core/desktop` only)

## Install

```sh
bun install
```

## Environment

```sh
cp .env.example .env
# Set QUEUE_ROOT to the repo root path
```

`QUEUE_ROOT` tells the queue and metrics services where to find `queue/` and `context/`. Defaults to `process.cwd()`.

## Running

```sh
# Build all packages first
bun run build

# Queue server (port 2727)
bun run queue

# Terminal dashboard
bun run tui

# Web dashboard (port 2728) — dev mode
cd core/web && bun run dev

# Metrics service (port 2729)
bun run metrics

# Sentinel cron runner (port 2730)
bun run sentinel

# Conductor orchestrator (port 2731)
bun run conductor

# Native desktop app (dev)
cd core/web && bun run dev   # start web first
cd core/desktop && bun run dev

# Documentation site
cd docsite && bun run dev
```

## Development

```sh
bun run build       # Build all packages
bun run typecheck   # Type-check all packages
bun run lint        # Lint all packages
bun run clean       # Clean all build outputs
```

## Stack

- **Runtime:** Bun
- **Monorepo:** Turbo
- **Language:** TypeScript (strict, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`)
- **Web dashboard:** Vite + React 19 + recharts
- **Native desktop:** Tauri v2 (Rust)
- **Queue/metrics persistence:** TOML files on disk
- **Agent platform:** Kiro CLI
- **Registry:** `@cde/hiro` (pinned)

## Service Ports

| Service | Port |
|---------|------|
| queue-server | 2727 |
| web dashboard | 2728 |
| metrics | 2729 |
| sentinel | 2730 |
| conductor | 2731 |

## Documentation

Full documentation at `docsite/`. Run `cd docsite && bun run dev` to browse locally.
