# evergreen-terrace — Phase Plan

## Phase 1 — MVP ✅

Core infrastructure. The minimum viable team.

- [x] Repo scaffold + `package.json` (`@cde/hiro` dep, Bun workspaces)
- [x] `context/` schema + project TOML files (springfield, fidget-tokens, adaptive-spirit, spectrum-ga-map)
- [x] `skills/nick-voice/` — voice model from writing samples
- [x] `skills/nick-conventions/` — TypeScript/React/Bun patterns
- [x] `steering/` — code-style, architecture-principles, project-context
- [x] `agents/pm/` — PRD generation, Jira tickets, backlog management
- [x] `agents/momentum-sentinel/` — on-demand project health scoring
- [x] `core/queue-server/` — Bun HTTP server, port 2727, TOML-backed queue
- [x] `core/dashboard/tui/` — terminal queue view

---

## Phase 2 — Voice + Engineering Team ✅

The full engineering org. Voice transform. Deep Springfield context.

- [x] `skills/springfield-context/` — Springfield architecture deep dive
- [x] `agents/voice/` — human-readable transform pipeline
- [x] `agents/eng-senior/` — architecture decisions, PR review, ADR authoring
- [x] `agents/eng-mid/` — feature implementation from spec
- [x] `agents/eng-junior/` — boilerplate, tests, scaffolding

---

## Phase 3 — Full Team + Integrations ✅

Stakeholder and director agents. Web dashboard. Live integrations.

- [x] `agents/stakeholder/` — status updates, business language translation
- [x] `agents/director/` — scope pressure, prioritization challenge
- [x] `skills/fidget-context/` — Fidget/Kite design system knowledge
- [x] `skills/agent-os-domain/` — agent-os domain knowledge (billing, ordering, etc.)
- [x] `core/web/` — React web dashboard (reads from queue-server via Vite proxy)
- [x] `integrations/jira/` — Jira MCP wrapper (create/update/query tickets)
- [x] `integrations/gitlab/` — GitLab MCP wrapper (MR creation, pipeline status)
- [x] `integrations/figma/` — Figma MCP wrapper (design spec access)
- [x] Cron sentinel — documented in `agents/momentum-sentinel/AGENT.md`; `core/sentinel/` runner is Phase 4

---

## Phase 4 — Metrics, Dashboard Tracking, and Native Interface

Observability, analytics, and long-term platform evolution.

### Metrics and Dashboard Tracking

Track what the system is doing and how well it's working.

- [ ] `core/metrics/` — Metrics collection service
  - Agent invocation counts and latency
  - Queue throughput (items created, delegated, completed per day/week)
  - Sentinel run history and score trends over time
  - Voice transform usage frequency
  - Per-project activity trends (complement to sentinel scoring)
- [ ] `core/dashboard/web/` metrics views
  - Queue velocity chart (items in/out over time)
  - Project health history (sentinel scores over time, per project)
  - Agent utilization breakdown
  - Work item age distribution (how long items sit in inbox before delegation)
- [ ] Metrics persistence — append-only TOML or SQLite log in `context/metrics/`
- [ ] Weekly digest — momentum-sentinel extended to produce a weekly summary with trend data

### Native Desktop Interface

Long-term: a dedicated GUI that isn't a terminal session.

- [ ] Tauri wrapper around `core/dashboard/web/`
  - Native macOS app
  - System tray integration — queue count badge, quick-add work item
  - Native notifications for sentinel alerts and queue items
  - No new React code needed — same web dashboard, native shell
- [ ] Offline-capable — reads from local TOML files, no server required for basic views
- [ ] Deep link support — open specific queue items or project views from notifications

### Parallel Execution (Gastown-style)

When the team is large enough to benefit from parallelism:

- [ ] `core/conductor/` — Gastown-inspired orchestrator
  - Mayor pattern: Nick describes a goal, conductor breaks it into beads
  - Polecats: parallel agent workers, each with a scoped task
  - Refinery: merge queue to prevent parallel work collisions
  - Witness: worker health monitoring
- [ ] Git-backed bead state (survives session restarts)
- [ ] Nondeterministic idempotence — tasks have acceptance criteria, not deterministic replay

---

## Design Principles Across All Phases

- **Narrow scope per agent** — each agent owns one lane, predictable output
- **Persistent context** — everything survives a session restart
- **Human gates at phase transitions** — Nick approves before work moves forward
- **Voice transform on all external output** — nothing goes out that doesn't sound like Nick
- **Springfield is read-only** — agents read from it, never write to it
- **`@cde/hiro` as registry source** — no sync scripts, just a dependency
