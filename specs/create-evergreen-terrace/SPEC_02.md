# SPEC_02 — CLI Package + Build Pipeline

## Context

`packages/create-grove/` is the npm-publishable package that consumers run via `bunx create-grove <output-dir>`. This spec covers the package scaffold, build pipeline, and TypeScript types — no wizard or scaffolding logic yet (those are SPEC_03 and SPEC_04).

## Prerequisites

- SPEC_01 complete (templates exist — needed for build verification)

## Requirements

### 1. Package Scaffold

New Bun workspace package at `packages/create-grove/`.

**`package.json`:**
```json
{
  "name": "create-grove",
  "version": "0.1.0",
  "description": "Scaffold your personal engineering org",
  "type": "module",
  "bin": {
    "create-grove": "./dist/index.js"
  },
  "files": [
    "dist",
    "templates"
  ],
  "scripts": {
    "build": "bun build/index.ts",
    "dev": "bun --watch src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "cac": "^6.7.14",
    "ink": "^5.0.0",
    "@inkjs/ui": "^2.0.0",
    "react": "^18.3.0",
    "picocolors": "^1.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/react": "^18.0.0"
  },
  "engines": {
    "bun": ">=1.3.13"
  }
}
```

Key decisions:
- `"files": ["dist", "templates"]` — templates ship alongside the compiled binary in the npm package
- `"bin"` entry makes the package runnable via `bunx create-grove`
- Single top-level binary entry point; no subcommands in Phase 1

### 2. Build Pipeline

Follows the evergreen-terrace build pipeline convention (CLAUDE.md: every `core/` or `packages/` runtime entry point MUST have a `Bun.build()` pipeline).

**`build/base.ts`:**
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

**`build/index.ts`:**
```typescript
import { createBaseConfig } from "./base";

const base = createBaseConfig();

const result = await Bun.build({
  ...base,
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  naming: "[dir]/[name].[ext]",
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(`[grove] built ${result.outputs.length} file(s)`);
```

### 3. TypeScript Configuration

The wizard uses React JSX, so the package tsconfig must enable JSX transform. Uses `react-jsx` (not `react` — the automatic runtime is required by ink 5).

**`tsconfig.json`** (extends root):
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "jsx": "react-jsx"
  },
  "include": ["src", "build"]
}
```

### 4. Source File Stubs

Create minimal stubs that typecheck cleanly. Implementation added in SPEC_03 and SPEC_04.

**`src/types.ts`:**
```typescript
export type ItemPriority = "p0" | "p1" | "p2" | "p3";
export type StackPreset = "bun-ts" | "rust" | "generic" | "docker-linux" | "design-system" | "turborepo";
export type Integration = "jira" | "gitlab" | "figma";

export interface ProjectEntry {
  name: string;
  repoPath: string;
  description: string;
  priority: ItemPriority;
}

export interface WizardAnswers {
  userName: string;
  orgName: string;
  projects: ProjectEntry[];
  stack: StackPreset;
  integrations: Integration[];
  outputDir: string;
}
```

**`src/templates.ts`:**
```typescript
export type TokenMap = Record<string, string>;

export function render(template: string, tokens: TokenMap): string {
  return Object.entries(tokens).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    template,
  );
}
```

**`src/wizard.tsx`** (stub — implemented in SPEC_03, `.tsx` because it contains JSX):
```typescript
import type { WizardAnswers, WizardOptions } from "./types";

export async function runWizard(outputDir: string, _options: WizardOptions): Promise<WizardAnswers> {
  throw new Error("not implemented — see SPEC_03");
}
```

**`src/scaffold.ts`** (stub — implemented in SPEC_04):
```typescript
import type { WizardAnswers } from "./types";

export async function scaffold(answers: WizardAnswers): Promise<void> {
  throw new Error("not implemented — see SPEC_04");
}
```

**`src/index.ts`:**
```typescript
import { dirname, join, resolve } from "node:path";
import cac from "cac";
import { runWizard } from "./wizard";
import { scaffold } from "./scaffold";

const PACKAGE_ROOT = dirname(dirname(new URL(import.meta.url).pathname));
export const TEMPLATES_DIR = join(PACKAGE_ROOT, "templates");

const cli = cac("create-grove");

cli
  .command("[output-dir]", "Scaffold a personal engineering org")
  .action(async (outputDir: string | undefined) => {
    if (!outputDir) {
      cli.outputHelp();
      process.exit(1);
    }
    const resolved = resolve(process.cwd(), outputDir);
    const answers = await runWizard(resolved);
    await scaffold(answers);
  });

cli.help();
cli.version("0.1.0");
cli.parse();
```

Key decisions:
- `new URL(import.meta.url).pathname` resolves the bundled file's path at runtime. `dirname` twice walks from `dist/index.js` up to the package root. This survives Bun's bundler — `import.meta.url` is a standard ESM feature preserved at runtime; `import.meta.dir` is not (it is evaluated at bundle time and burns in the source path, which breaks when the package is installed elsewhere).
- `TEMPLATES_DIR` is exported so `scaffold.ts` can import it directly without re-deriving the path.
- No-arg invocation prints help and exits 1. `--help` / `-h` and `--version` / `-v` are handled automatically by cac.

### 5. Root Workspace Registration

Add the new package to the root `package.json` workspaces array:

```json
{
  "workspaces": [
    "core/*",
    "docsite",
    "packages/*",
    "internal/*"
  ]
}
```

`packages/*` glob already includes `packages/create-grove` — no change needed if the glob is already in place.

### 6. Turbo Task Registration

The new package participates in root-level `build` and `typecheck` tasks via the existing `turbo.json` task graph. No changes to `turbo.json` needed — the package's `build` and `typecheck` scripts are auto-discovered.

### 7. Pre-publish Template Copy Step

The `dist/` output is the compiled JS. The `templates/` directory must be included in the npm package for the scaffolding engine to read at runtime. This is handled by `"files": ["dist", "templates"]` in package.json.

`TEMPLATES_DIR` is resolved in `src/index.ts` using the runtime path of the bundled entry point:

```typescript
import { dirname, join } from "node:path";

const PACKAGE_ROOT = dirname(dirname(new URL(import.meta.url).pathname));
export const TEMPLATES_DIR = join(PACKAGE_ROOT, "templates");
```

`new URL(import.meta.url).pathname` is a standard ESM feature that Bun's bundler preserves — at runtime it resolves to the actual location of the running file (e.g. `/home/user/.bun/install/global/node_modules/create-grove/dist/index.js`). Two `dirname` calls walk from `dist/index.js` to the package root, where `templates/` lives. This works correctly whether the package is run from source, from `dist/`, or installed globally via `bunx`.

**Do not use `import.meta.dir` in source files.** It is evaluated at bundle time and resolves to the *source* file's directory, which is meaningless after the package is built and installed elsewhere. Do not use it in tests either unless the test is specifically verifying the source file's directory location — in which case the usage must be confined to the test file only and must never be imported from source.

`scaffold.ts` imports `TEMPLATES_DIR` from `index.ts`:

```typescript
import { TEMPLATES_DIR } from "./index";
```

This avoids re-deriving the path in SPEC_04.

## File Structure

```
packages/create-grove/
├── build/
│   ├── base.ts
│   └── index.ts
├── src/
│   ├── index.ts          CLI entry point
│   ├── types.ts          WizardAnswers, ProjectEntry, StackPreset, Integration
│   ├── templates.ts      render() — token substitution
│   ├── wizard.tsx        stub (SPEC_03) — .tsx because it renders React/ink components
│   └── scaffold.ts       stub (SPEC_04)
├── package.json
└── tsconfig.json
```

## Acceptance Criteria

- [ ] `packages/create-grove/` exists with all files listed in the file structure above
- [ ] `bun --cwd packages/create-grove run build` exits 0 and produces `dist/index.js`
- [ ] `bun run typecheck` at repo root exits 0 (covers this package)
- [ ] `bun run packages/create-grove/src/index.ts` (with no args) prints help and exits 1
- [ ] `bun run packages/create-grove/src/index.ts --help` prints help and exits 0
- [ ] `bun run packages/create-grove/src/index.ts --version` prints version and exits 0
- [ ] `packages/create-grove/src/types.ts` exports `WizardAnswers`, `ProjectEntry`, `StackPreset`, `Integration`, `ItemPriority`
- [ ] `StackPreset` does not include `"both"` — valid values are `"bun-ts" | "rust" | "generic" | "docker-linux" | "design-system" | "turborepo"`
- [ ] `src/index.ts` contains no use of `import.meta.dir`
- [ ] `src/index.ts` derives `TEMPLATES_DIR` via `new URL(import.meta.url).pathname`
- [ ] `render("Hello {{NAME}}", { NAME: "World" })` returns `"Hello World"` (unit-testable without stubs)
- [ ] `bun install` at repo root resolves `cac`, `ink`, `@inkjs/ui`, `react`, and `picocolors` in `packages/create-grove/node_modules` or hoisted root

## Dependencies

- SPEC_01 (templates directory must exist for dist verification)

## Verification

```bash
# Build passes
bun --cwd packages/create-grove run build
echo "Exit: $?"   # expect 0

# dist exists
ls packages/create-grove/dist/index.js

# typecheck passes from root
bun run typecheck
echo "Exit: $?"   # expect 0

# no-arg exits 1 with help output
bun run packages/create-grove/src/index.ts 2>&1
echo "Exit: $?"   # expect 1

# --help exits 0
bun run packages/create-grove/src/index.ts --help
echo "Exit: $?"   # expect 0

# --version exits 0
bun run packages/create-grove/src/index.ts --version
echo "Exit: $?"   # expect 0

# no import.meta.dir in source
grep -rn "import\.meta\.dir" packages/create-grove/src/ \
  && echo "FAIL: import.meta.dir found in source" || echo "PASS"

# TEMPLATES_DIR uses import.meta.url
grep -q "import.meta.url" packages/create-grove/src/index.ts \
  && echo "PASS: import.meta.url present" || echo "FAIL: missing import.meta.url"

# StackPreset does not contain "both"
grep -q '"both"' packages/create-grove/src/types.ts \
  && echo "FAIL: StackPreset still contains both" || echo "PASS"

# render() works
bun -e "
  import { render } from './packages/create-grove/src/templates.ts';
  const out = render('Hello {{NAME}}', { NAME: 'World' });
  console.assert(out === 'Hello World', 'render failed');
  console.log('PASS');
"
```
