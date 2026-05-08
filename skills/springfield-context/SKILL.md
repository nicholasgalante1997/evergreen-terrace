# springfield-context

Deep context for the Springfield code intelligence platform. Read this before working on any task that touches `agent-tools-prototype-workspace`. Do not modify Springfield from agents in this system — it is a data source and MCP server. This skill is for understanding, not for making changes.

---

## What Springfield Is

Springfield is a code intelligence and static analysis platform for agent-os — Charter's telecom SaaS employee dashboard. It analyzes the agent-os codebase (a large enterprise microfrontend system) and produces structured data about React components, dependencies, Fidget/Kite design system adoption, and package relationships.

The output feeds a Neo4j graph database, a SQLite in-memory store, a GraphQL API, and a React visualization dashboard.

---

## Repository Location

`/Users/P3062609/dev/agent-tools-dt/agent-tools-prototype-workspace`

Turbo monorepo. Bun runtime (v1.2.20+). TypeScript strict mode throughout.

---

## Package Ecosystem

| Package | Purpose |
|---------|---------|
| `@springfield-models` | Core domain models: `InventoryJson`, `InventoryBuilder`, `ComponentAnalyzer`, `ReactBuilder`, `FidgetComponentBuilder`, `GitlabClient`, `Neo4J`, `DocGen` |
| `@springfield-processes` | Git operations and data generation commands. Has `data/`, `git/`, `toml/` submodules |
| `@springfield-types` | TypeScript type definitions and DTOs: `FidgetComponentSnapshot`, `PackageSnapshot`, `ReactComponentDataSnapshot`, `GraphNodeDTOs`, `GraphEdgeDTOs` |
| `@springfield-constants` | File path constants (`paths.ts`), error codes, Fidget component lists |
| `@springfield-utils` | `spawnAsync`, `pipe`, `strings`, `wd`, `repositories` |
| `@springfield-state` | XState machine definitions for workflow orchestration |
| `@springfield-configs` | Shared TypeScript config presets, GitLab repository list |

---

## Core Applications

| App | Location | Port | Purpose |
|-----|----------|------|---------|
| `springfield-cli` | `core/springfield-cli/` | — | Main CLI. Two entry points: `session.ts` (interactive REPL `duff-sesh`) and `exec.ts` (executor `duff-exec`) |
| `springfield-api` | `core/springfield-api/` | — | Bun HTTP server backed by Neo4j |
| `springfield-db` | `core/springfield-db/` | 4100 | Standalone Bun HTTP server for database queries |
| `springfield-dump` | `core/springfield-dump/` | — | Data warehouse. 67 domain-specific dump directories (billing, ordering, fidget, agent-os, etc.) |
| `springfield-docsify` | `core/springfield-docsify/` | — | Documentation site built with `@bundt/dxdocs` |
| `springfield-mcp` | `core/springfield-mcp/` | — | MCP server exposing Springfield's analysis as tools. Has `handlers/`, `tools.ts`, `router.ts` |
| `web` | `core/web/` | 5280 | React 19 visualization dashboard |

---

## Data Pipeline

Three phases, run via `duff-exec`:

**Phase 1 — Repository Setup:**
```bash
duff-exec setup:clone-mui-core    # Clone MUI platform fork
duff-exec setup:clone-agent-os    # Clone AgentOS repo
duff-exec update:toml-config      # Update config with dependency list
duff-exec setup:clone             # Clone all dependencies
```

**Phase 2 — Data Generation:**
```bash
duff-exec graph:json              # Dependency graph JSON
duff-exec react:json              # React component analysis
duff-exec fidget:json             # Fidget component usage
```

**Phase 3 — Aggregation:**
```bash
duff-exec graph:aggregate         # Consolidate all JSON outputs
```

Output lands in `core/springfield-dump/dump/{domain}/` as JSON files, then gets loaded into SQLite and Neo4j.

---

## Web Application Architecture

**Stack:** React 19, Webpack 5, MUI, D3, Three.js, Recharts, Zustand, TanStack Query, GraphQL (Apollo), GSAP

**Component pattern:**
```
ComponentName/
├── index.ts              # Barrel export
├── ComponentName.tsx     # React.memo wrapped component
├── types.ts              # Props interface
├── ComponentName.stories.tsx
└── ComponentName.test.tsx
```

**Page pattern:** `{Namespace}_{PageName}.tsx` exported with `pipeline(withProfiler<Props>('Namespace_Page'), React.memo)(Component)`

**Path aliases:** `@/` → `src/`, `@json/` → `db/json/`, `@public/` → `public/`

**Hook naming:** `{Feature}_use{Action}.ts` (e.g., `Base_useGetBlogPosts.ts`)

**API handler pattern:**
```ts
export const featureHandler = async (req: Request): Promise<Response> => {
  try {
    // ...
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    return new Response(
      `<pre>${e instanceof Error ? `${e.name}: ${e.message}\n\n${e.stack}` : JSON.stringify(e, null, 2)}</pre>`,
      { status: 500 },
    );
  }
};
```

**State management:** Zustand for global, Context for feature-scoped, TanStack Query for server state

---

## CLI Architecture

`core/springfield-cli/lib/` contains:
- `commands/` — CLI command handlers (14 commands as of last review)
- `database/` — SQLite3 wrapper
- `sqlite3/` — SQL schema definitions
- `workers/` — Background workers
- `prompts/` — Interactive prompt helpers

Commands use `commander` and `cac`. Interactive prompts use `@inquirer/prompts`. Terminal output uses `chalk`.

All subprocess execution goes through `@springfield-utils/spawnAsync` — never raw `exec` or `spawn`.

---

## MCP Server

`core/springfield-mcp/src/` exposes Springfield's analysis capabilities as MCP tools:
- `tools.ts` — Tool definitions
- `router.ts` — Request routing
- `handlers/` — 17 handler modules
- `transports/` — Transport layer
- `db.ts` — Database connection
- `lifecycle.ts` — Server lifecycle

This is the integration surface for agents that need to query Springfield data.

---

## Existing Agents in Springfield

Springfield has its own `.kiro/agents/` directory with purpose-built agents:

- `springfield.json` — Main Springfield dev agent (claude-opus-4.6). Knows the full pipeline, all packages, all commands. Has `agentSpawn` hook that lists packages and commands on startup. Keyboard shortcut: `ctrl+shift+s`.
- `component-dev.json` — React 19 component development with Kite/Fidget integration.
- `api-dev.json` — Bun server handler development, TanStack Query hooks, model classes.
- `code-reviewer.json` — Read-only code review against established standards.
- `state-manager.json` — XState machine development.
- `prototype-builder.json` — Prototype workflow orchestration.
- `mise-runner.json` — Task runner operations.
- `springfield-docs.json` — Documentation generation.

These agents are available in the Springfield workspace context. They are not duplicated in evergreen-terrace — reference them when working in that repo.

---

## Key Constraints

- **Never mutate `springfield-dump` data in place** — copy first
- **Use `@springfield-constants` for all file paths** — never hardcode
- **Use `@springfield-utils/spawnAsync` for all subprocess execution**
- **Run `mise run test:springfield` before committing Springfield changes**
- **Package boundaries are strict** — no circular dependencies
- **Bun v1.2.20+** required

---

## Dump Directory Domains

The `core/springfield-dump/dump/` directory has 67 domain subdirectories corresponding to agent-os feature areas: `account`, `account-memo`, `agent-assist`, `agent-os`, `agent-os-companions`, `alert`, `alert-definition`, `analytics`, `bad-debt`, `billing`, `bridge`, `call`, `case-management`, `comm-preferences`, `competitive-edge`, `content`, `customer-interactions`, `customer-qualification`, `dark-fidget-theme`, `device`, `disconnects`, `dispatch`, `domain-event`, `email`, `entitlements`, `eventboard`, `fidget`, `gateway-theme`, `gmat`, `identity`, `internet-assist`, `journal`, `knowledge`, `location`, `mobile`, `mobilediagnostics`, `mui`, `ordering`, `payments`, `phonenumber`, `ppv`, `react`, `shipments`, `singlecustomerincident`, `timeline`, `tools`, `troubleshooting`, `ui`, `util`, `vendor`, `web-api-client`.

Each domain directory contains per-package analysis JSON files.

---

## Steering Documents

Springfield has its own steering docs in `.kiro/steering/core/web/`:
- `code-standards.md` — Path aliases, naming, TypeScript, HOC composition
- `react/component-composition.md` — Component structure, props, memoization
- `react/react-frontend.md` — React 19 patterns
- `react/state-management.md` — Zustand, Context, TanStack Query
- `react/routing-pages.md` — Page routing patterns
- `react/layouts.md` — Layout component patterns
- `api/api-handlers.md` — Bun server handler patterns
- `api/bun-server.md` — Bun.serve() specifics
- `utilities.md` — Utility function patterns
- `prototype-workflow.md` — Prototype development workflow

Read these before generating any Springfield-specific code.
