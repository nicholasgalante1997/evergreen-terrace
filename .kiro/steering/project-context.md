# Project Context — evergreen-terrace

## What This Repo Is

A Bun/TypeScript Turbo monorepo. Personal engineering org. Agent team, work queue, momentum sentinel.

## Workspace Layout

```
core/        Runtime apps (queue-server, tui, dashboard/web)
packages/    Shared libraries (@evergreen-terrace/common)
internal/    Private build tooling (@evergreen-terrace/build-utils)
agents/      Kiro agent definitions
skills/      Shared knowledge bases
steering/    Global steering docs
integrations/ Jira, GitLab, Figma MCP configs
context/     Persistent project state (TOML)
queue/       Work items (inbox/, active/)
docsite/     @bundt/dxdocs documentation site
```

## Build Pipeline — Non-Negotiable

Every package in `core/` that has a runtime entry point MUST have a `Bun.build()` pipeline. No exceptions.

The pattern, derived from `open-source-project-examples/bundt-develop/`:

```
package/
├── build/
│   ├── base.ts      createBaseConfig({ external: [...deps] })
│   └── index.ts     concurrent_build({ ...base, entrypoints, target: "bun", naming })
├── src/
│   └── index.ts     source
└── package.json     build: "bun build/index.ts"
```

`@evergreen-terrace/build-utils` (in `internal/`) provides `createBaseConfig` and `concurrent_build`. All `core/` apps depend on it as a devDependency.

**`dev` scripts run source directly** (`bun --watch src/index.ts`) for fast iteration.  
**`build` scripts produce `dist/index.js`** via `Bun.build()`.  
**Root `queue` and `tui` scripts run `dist/index.js`** — the compiled output, not source.

Failing to add a build pipeline when writing a new `core/` package is a code smell that will require remediation. Do not defer it.

## TypeScript Configuration

All packages extend the root `tsconfig.json`. Key settings that must not be weakened:

- `"module": "Preserve"` — not `"ESNext"`
- `"verbatimModuleSyntax": true` — enforces `import type` for type-only imports
- `"noUncheckedIndexedAccess": true` — catches array/object access bugs at compile time
- `"noImplicitOverride": true`
- `"moduleDetection": "force"`

Every package has its own `tsconfig.json` extending `../../tsconfig.json` and a `typecheck` script running `tsc --noEmit`.

## Shared Types — Single Source of Truth

`@evergreen-terrace/common` (`packages/common/`) is the only place `QueueItem`, `QueueState`, and shared config constants live. No package duplicates these. If a type is needed in more than one package, it belongs in `common`.

## Path Resolution — No Bundling-Unsafe Patterns

Filesystem paths are resolved at runtime in entry points only, using `process.env.QUEUE_ROOT ?? process.cwd()`. Never use `import.meta.url`, `new URL(...)`, or `import.meta.dir` for path resolution in shared config — these do not survive bundling.

Shared config (`packages/common/src/config.ts`) holds only structural constants (ports, etc.). It never resolves paths.

## Turbo Task Graph

All packages declare `build`, `typecheck`, and `clean` scripts. Turbo's task graph:

```
build → typecheck → test
```

Root scripts delegate to `turbo run <task>`. Never bypass Turbo for workspace-wide operations.

## OSS Reference Projects

When in doubt about conventions, read:

- `/Users/P3062609/dev/open-source-project-examples/bundt-develop/` — primary reference for build pipelines, tsconfig, turbo, package structure
- `/Users/P3062609/dev/open-source-project-examples/Arcturus-JR-dev/` — secondary reference
- `/Users/P3062609/dev/open-source-project-examples/deckvault-dev/` — secondary reference

If a pattern exists in those projects, apply it here. Do not invent alternatives.
