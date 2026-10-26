---
name: turborepo
description: Turborepo-orchestrated Bun monorepo conventions — workspace layout, task graph, build pipeline, scoped commands, and changesets
tags: [turborepo, monorepo, bun, build, typescript]
---

# Turborepo Monorepo Conventions

## Priority

**High**

## Instructions

**ALWAYS** use `apps/` for deployable CLIs and servers, `packages/` for publishable libraries, `internal/` for private shared tooling — never mix these (ID: TURBO-001)

**ALWAYS** declare `"workspaces": ["apps/*", "packages/*", "internal/*"]` in root `package.json` (ID: TURBO-002)

**NEVER** use `cache: true` on tasks that read from the filesystem at runtime or produce non-deterministic output (ID: TURBO-003)

**ALWAYS** give `build` tasks `dependsOn: ["^build"]` so dependencies are built first (ID: TURBO-004)

**ALWAYS** give `typecheck` tasks `dependsOn: ["^build"]` — typechecking requires built dependency types (ID: TURBO-005)

**ALWAYS** use `persistent: true` on `dev` tasks and `cache: false` on `test` and `typecheck` (ID: TURBO-006)

**NEVER** manually edit `CHANGELOG.md` — let changesets generate it (ID: TURBO-007)

**ALWAYS** use `"workspace:*"` syntax for sibling package references in `package.json` (ID: TURBO-008)

### Workspace Layout

```
project-root/
├── apps/                    Deployable CLIs and servers
│   ├── api-server/          package.json: { "name": "@org/api-server" }
│   └── web/                 package.json: { "name": "@org/web" }
├── packages/                Publishable libraries
│   ├── ui/                  package.json: { "name": "@org/ui" }
│   └── common/              package.json: { "name": "@org/common" }
├── internal/                Private shared tooling (never published)
│   └── build-utils/         package.json: { "name": "@org/build-utils" }
├── turbo.json
├── package.json             { "workspaces": ["apps/*", "packages/*", "internal/*"] }
└── tsconfig.json            Root tsconfig extended by all packages
```

Each package's `package.json` must include:
```json
{
  "name": "@org/package-name",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "bun build/index.ts",
    "typecheck": "tsc --noEmit",
    "dev": "bun --watch src/index.ts"
  }
}
```

Each package's `tsconfig.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src", "build"]
}
```

### Task Graph (`turbo.json`)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": [],
      "cache": false
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": [],
      "cache": false
    },
    "lint": {
      "dependsOn": [],
      "outputs": []
    },
    "dev": {
      "persistent": true,
      "cache": false
    },
    "clean": {
      "cache": false
    }
  }
}
```

### Build Pipeline Pattern

`build/base.ts` — shared config factory:

```typescript
import type { BuildConfig } from "bun";

export function createBaseConfig(overrides: Partial<BuildConfig> = {}): BuildConfig {
  return {
    target: "bun",
    format: "esm",
    minify: false,
    sourcemap: "external",
    ...overrides,
  };
}
```

`build/index.ts` — concurrent build runner:

```typescript
import { createBaseConfig } from "./base";

const base = createBaseConfig();

// Run multiple entry points concurrently when needed
async function concurrent_build(...configs: Parameters<typeof Bun.build>[0][]) {
  const start = Date.now();
  const results = await Promise.all(configs.map((c) => Bun.build(c)));

  for (const result of results) {
    if (!result.success) {
      for (const log of result.logs) console.error(log);
      process.exit(1);
    }
  }

  const elapsed = Date.now() - start;
  console.log(`[build] ${results.flatMap((r) => r.outputs).length} file(s) in ${elapsed}ms`);
}

await concurrent_build({
  ...base,
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  naming: "[dir]/[name].[ext]",
});
```

### Scoped Commands

Build one package and its dependencies:
```bash
turbo run build --filter=@org/api-server
```

Build a package and all packages that depend on it:
```bash
turbo run build --filter=...@org/common
```

Build all apps:
```bash
turbo run build --filter=./apps/*
```

Run dev for a specific app:
```bash
turbo run dev --filter=@org/web
```

### Package Inter-Dependencies

Sibling package reference in `package.json`:
```json
{
  "dependencies": {
    "@org/common": "workspace:*"
  },
  "devDependencies": {
    "@org/build-utils": "workspace:*"
  }
}
```

Import in source:
```typescript
import { QueueItem, PRIORITY_LEVELS } from "@org/common";
import { createBaseConfig } from "@org/build-utils";
```

Bun workspaces resolves `workspace:*` to the local package — no npm registry involved during development.

### Changesets (OSS Publishing)

Setup (one time):
```bash
bunx changeset init
```

Before merging a change that affects a published package:
```bash
bunx changeset
# Follow prompts: select packages, choose bump type (patch/minor/major), describe the change
```

Release process:
```bash
bun run version   # applies pending changesets, bumps versions, updates CHANGELOGs
bun run release   # build → typecheck → publish to npm
```

`package.json` release scripts:
```json
{
  "scripts": {
    "version": "changeset version",
    "release": "turbo run build typecheck && changeset publish"
  }
}
```

Internal packages (in `internal/`) are never published — omit changesets for them. Mark them with `"private": true` in `package.json`.

## Common Mistakes

- **Mixing apps and libraries in `apps/`**: Publishable libraries belong in `packages/`. The distinction matters for changesets (only `packages/` items get version bumps) and for consumers who need to import your libraries.
- **Setting `cache: false` globally**: Only disable cache for tasks that cannot be cached (non-deterministic, reads from filesystem at runtime). `build` and `lint` tasks are cacheable and should benefit from Turborepo's cache.
- **Missing `dependsOn: ["^build"]` on `typecheck`**: TypeScript needs the compiled declaration files from dependencies to typecheck. Without this, typechecking a package that imports `@org/common` will fail if `@org/common` hasn't been built first.
- **Using `*` instead of `"workspace:*"` for sibling dependencies**: `*` will resolve from the npm registry and install a published version, not the local one. Always `"workspace:*"` for local sibling packages.
- **Manually editing `CHANGELOG.md`**: Changesets owns the changelog. Manual edits will be overwritten on the next `changeset version` run and cause git conflicts.
- **Publishing internal packages**: `internal/` packages are private build tooling. They must have `"private": true` and must not appear in changeset bumps. If they're accidentally published, they expose internal implementation details and create a public API obligation.
