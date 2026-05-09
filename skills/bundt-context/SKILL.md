# bundt-context

Deep context for the bundt OSS workspace (`~/dev/bundt`). Read this before working on any task that touches a `@bundt/*` package.

---

## What Bundt Is

Bun Developer Toolkits — a collection of independently versioned developer tools built on Bun. Unified in a Turbo monorepo. Each package ships separately under the `@bundt` npm scope, with zero coupling to siblings. They're designed to compose but can be used standalone.

**Repository:** `~/dev/bundt`
**Package manager:** Bun. **Orchestration:** Turbo. **Runtime:** Bun.

---

## Workspace Structure

```
bundt/
├── apps/              Deployable CLIs and applications
│   ├── cleo/          @bundt/cleo — Claude extensions orchestrator
│   ├── dxdocs/        @bundt/dxdocs — static doc generator
│   └── ollama/        @bundt/loclaude — local LLM management CLI
├── packages/          Publishable npm libraries
│   ├── prev/          @bundt/prev — agent-native React SSR framework
│   ├── hateoas/       @bundt/hateoas — React HATEOAS REST framework
│   ├── waavy/         @bundt/waavy — React SSR for non-JS servers
│   └── signals/       @bundt/signals — signal graph abstractions
├── internal/          Private shared packages
│   ├── build-utils/   @bundt/internal-build-utils — Bun.build() helpers
│   └── shared/        cross-package types and utilities
└── turbo.json         task graph: build → typecheck → test
```

---

## Package Inventory

### `@bundt/cleo` (apps/cleo)
Claude extensions orchestrator. Status: pre-release (0.1.0).

- **Headless task runner** — `cleo run "prompt"` dispatches to Claude Code, returns structured JSON with cost and token reporting
- **Interactive TUI** — manage multiple concurrent Claude Code sessions with vim-style nav
- **Agent lifecycle** — install, uninstall, validate, rollback agents and skills
- **BCP integration** — Bit Context Protocol for token-efficient context delivery
- **Task templates** — save and reuse task definitions
- **Qualified names** — `namespace/name:tag@version` addressing for agents/skills (ADR-001)
- **Registry** — scaffolded but not yet live

CLI entry: `cleo`. Global install: `bun add -g @bundt/cleo`.

### `@bundt/dxdocs` (apps/dxdocs)
Zero-client-JS static doc generator. MDX → fast, accessible HTML. Used by bundt itself and other projects for documentation sites.

### `@bundt/loclaude` (apps/ollama)
Local LLM management CLI for Ollama. Zero API costs, complete privacy. Wraps Ollama model management with a clean interface.

### `@bundt/prev` (packages/prev) — Most Active
Agent-native React SSR framework. Status: v0.3.0. Core engine stable, API stabilizing toward v1.0.

**Core concepts:**
| Concept | Description |
|---------|-------------|
| **Fragment** | Self-contained UI component with typed props, data requirements, interaction declarations, layout hints |
| **DataSource** | Server-side data fetcher with typed params/returns, optional TTL caching |
| **Frame** | Composed workspace — fragment instances with layout positions, data bindings, interaction wiring |
| **Session** | Persistent state across compositions — frame history with back/forward navigation |
| **Binding** | Wire connecting one fragment's interaction output to another's prop or data param |
| **Mutation** | Runtime modification to a live frame — add, remove, replace, resize fragments |

**Server composes the UI.** An agent or orchestrator sends a composition request specifying which fragments to show and how to wire them. The server assembles a Frame, streams it to the browser via SSR, handles interactions via WebSocket.

**Defining a fragment:**
```ts
import { defineFragment } from '@bundt/prev';
import { z } from 'zod';

const userList = defineFragment({
  id: 'user-list',
  props: z.object({ limit: z.number().default(10) }),
  interactions: { selectUser: z.object({ userId: z.string() }) },
  render: ({ limit }) => <UserListComponent limit={limit} />,
});
```

**Source layout:**
```
packages/prev/src/
├── build/         build pipeline
├── client/        browser runtime
├── composition/   frame composition engine
├── define.test.ts fragment/datasource definition tests
├── index.ts       public API
├── registry/      fragment and datasource registry
├── server/        SSR + WebSocket server
├── server-exports.ts
└── types.ts       shared types
```

Uses Zod 4 for all schema definitions. Bun.serve() for the HTTP/WebSocket server.

### `@bundt/hateoas` (packages/hateoas)
React framework for HATEOAS REST APIs. Renders hypermedia controls from server responses.

### `@bundt/waavy` (packages/waavy)
React SSR for non-JavaScript server environments. Wraps React's renderToString/renderToReadableStream with a simple interface.

### `@bundt/signals` (packages/signals)
Signal graph abstractions — signals, computed values, and effects. Reactive state without a framework.

---

## Build Conventions

**TypeScript packages:**
```
package/
├── build/base.ts       createBaseConfig({ external: [...deps] })
├── src/index.ts        source entry
└── package.json        build: "bun run build/base.ts"
```

`@bundt/internal-build-utils` provides `createBaseConfig`. All packages depend on it as a dev dep.

**Turbo task graph:** `build → typecheck → test`. Run workspace-wide with `turbo run <task>`.

---

## TypeScript Conventions

Mirrors `skills/nick-conventions/` with one addition: **no default exports anywhere** — named exports only including page-level components. All packages use `verbatimModuleSyntax` and `noUncheckedIndexedAccess`.

---

## Versioning and Release

Each package versions independently. Git tags: `@bundt/<name>@<version>`.

Use Changesets (`@changesets/cli`) for coordinated bumps. Don't manually edit `CHANGELOG.md` — changesets generates it.

**Single-package release:**
```sh
bunx changeset         # describe the change
bun run version        # bump versions from changeset descriptions
bun run release        # build, typecheck, publish
```

---

## Key Constraints

- **No coupling between packages** — a package may not import a sibling `@bundt/*` package except via explicit peer or optional deps
- **`@bundt` scope only** — never publish under another scope
- **Bun runtime** — no Node.js compatibility shims unless a consuming environment requires it
- **External Bit Context Protocol** — `@bit-context-protocol/*` is an external dependency, not owned by this repo
