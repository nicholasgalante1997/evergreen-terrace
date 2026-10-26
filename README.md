# evergreen-terrace

Personal engineering org for a one-person shop operating at principal scope.

> **V1 architecture:** Evergreen Terrace is being rebuilt additively as a
> local-first engineering factory with Compose-managed services, a host-side MCP
> bridge, isolated worktrees, ACP workers, Kafka-backed events, and a full React
> console. The approved contract is in
> [`specs/evergreen-v1/`](specs/evergreen-v1/). The queue/conductor instructions
> below describe the preserved legacy system, not the v1 execution path.

The bottleneck isn't access or management — it's team support. evergreen-terrace provides the PM, design, and engineering team that doesn't otherwise exist. Role-scoped agents handle the work that would otherwise fall to a full team. A persistent work queue tracks everything. A momentum sentinel surfaces what's going stale before it becomes a problem.

→ **New here? Read the [User Manual](USER_MANUAL.md).**

---

## What's here

```
core/             Runtime services (Bun/TypeScript)
  queue-server/   Work queue HTTP server — port 2727
  web/            Vite/React dashboard — port 2728
  metrics/        Metrics collection — port 2729
  sentinel/       Momentum scoring server — port 2730
  conductor/      Parallel agent orchestrator — port 2731
  tui/            Terminal dashboard
  desktop/        Tauri v2 desktop app (optional)
packages/         Shared libraries (@evergreen-terrace/common, @evergreen-terrace/config)
internal/         Build utilities (@evergreen-terrace/build-utils)
agents/           Agent definitions (AGENT.md + agent.json) for 8 roles
skills/           Shared knowledge bases loaded into agent system prompts
steering/         Global docs read by all agents
context/          Persistent state — project TOMLs, queue metrics, sentinel reports, conductor beads
queue/            Work items — inbox/ (pending), active/ (in-flight), completed/
scripts/          Local dev utilities
docsite/          Technical reference documentation (@bundt/dxdocs)
```

---

## Requirements

- **Bun** `>= 1.3.13`
- **Claude Code CLI** — `claude --version` must work
- **mise** (optional) — provides the task runner

---

## Setup

```bash
bun install
cp .env.example .env
# Edit .env: set QUEUE_ROOT to the absolute path of this repo
```

`QUEUE_ROOT` is the only required env variable. It defaults to `process.cwd()` if unset, which works when running from the repo root.

### V1 control-plane foundation

The first v1 slice runs the command event path locally: Postgres command state →
outbox → Apache Kafka → read projection. Copy `.env.example`, replace all
`ET_*_PASSWORD` placeholders with unique local values, then run:

```bash
bun run factory:up
bun run factory:status
curl http://127.0.0.1:7410/readyz
curl http://127.0.0.1:7440/readyz
```

`factory:down` stops the services without deleting volumes or evidence. See
[`specs/evergreen-v1/ARCHITECTURE.md`](specs/evergreen-v1/ARCHITECTURE.md) for
the boundaries and recovery model.

### V1 host bridge

The native host bridge owns local Git, `.et` policy, and harness-facing MCP
transports. It deliberately runs outside Compose, so containers never receive
your checkout, credential store, or harness authentication. Ensure the target
repository has an approved `.et/config.toml`, then use either transport:

```bash
# Harness-spawned newline-delimited JSON-RPC over stdin/stdout.
bun run bridge:stdio

# Loopback HTTP MCP endpoint at http://127.0.0.1:7450/mcp.
bun run bridge:http
```

The v0 bridge exposes workspace status, policy-gated durable goal submission,
durable decision request/resolution, deterministic worktree preparation, and
durable worker assignment/execution, and explicit remote synchronization. ACP
permission requests follow the governed decision path; normal worktree-local
one-time commands remain autonomous.

---

## Running

**Everything at once:**

```bash
bun run start          # build + start all services + open browser
bun run start:dev      # start without rebuilding (faster)
bun run start:headless # start without opening browser

# With mise:
mise run start
```

**Individual services:**

```bash
bun run queue          # port 2727
bun run sentinel       # port 2730
bun run metrics        # port 2729
bun run conductor      # port 2731
bun run dashboard      # port 2728 (dev mode)
bun run tui            # terminal dashboard
```

**Remote access (laptop → DGX over SSH):**

```bash
# On your laptop:
~/bin/evergreen-tunnel      # forwards all service ports locally
```

See `scripts/tunnel.sh` for setup.

---

## Service ports

| Service       | Port |
| ------------- | ---- |
| queue-server  | 2727 |
| web dashboard | 2728 |
| metrics       | 2729 |
| sentinel      | 2730 |
| conductor     | 2731 |

---

## Agent team

Eight role-scoped agents, registered globally in `~/.claude/agents/` and available in any Claude Code session:

| Agent               | Role                                               |
| ------------------- | -------------------------------------------------- |
| `pm`                | PRD generation, ticket authoring, backlog grooming |
| `eng-senior`        | Architecture decisions, PR review, ADR authoring   |
| `eng-mid`           | Feature implementation from spec                   |
| `eng-junior`        | Boilerplate, tests, scaffolding                    |
| `director`          | Scope pressure, prioritization challenge           |
| `stakeholder`       | Status updates, business language                  |
| `voice`             | Output rewrite in Nick's register                  |
| `momentum-sentinel` | Cross-project health scoring                       |

Agents sync automatically to `~/.claude/agents/` via the PostToolUse hook in `.claude/settings.json` when you edit `agents/`, `skills/`, or `steering/`. Manual sync: `bun run sync-agents`.

---

## Queue item schema

```toml
[item]
id = ""           # UUID
title = ""
project = ""      # must match context/projects/{name}.toml
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

---

## Development

```bash
bun run build       # build all packages
bun run typecheck   # type-check all packages
bun run clean       # remove all dist/
```

---

## Documentation

- **[User Manual](USER_MANUAL.md)** — how to use the system day to day
- **[Docsite](docsite/)** — technical reference (`cd docsite && bun run dev`)
- **[Workflow guides](.claude/workflows/)** — Model A and Model B execution patterns
