---
name: bun-ts
description: Bun runtime, TypeScript strict mode, React 19, and evergreen-terrace monorepo conventions
tags: [bun, typescript, react, monorepo, testing]
---

# Bun / TypeScript / React Conventions

## Priority

**Critical**

## Instructions

**ALWAYS** use `"module": "Preserve"` in tsconfig — never `"ESNext"` (ID: BTS-001)

**ALWAYS** enable `"verbatimModuleSyntax": true` and use `import type` for type-only imports (ID: BTS-002)

**ALWAYS** enable `"noUncheckedIndexedAccess": true` — treat all array/record access as potentially undefined (ID: BTS-003)

**ALWAYS** enable `"moduleDetection": "force"` to ensure all files are treated as modules (ID: BTS-004)

**NEVER** use `any` — use `unknown` with type guards or explicit interfaces (ID: BTS-005)

**NEVER** use `enum` — use `as const` objects or union string/number literal types (ID: BTS-006)

**NEVER** use default exports for utilities or shared modules — named exports only (ID: BTS-007)

**ALWAYS** use `Bun.serve()` for HTTP servers — never express, fastify, or hono (ID: BTS-008)

**ALWAYS** use `Bun.file()` for file I/O — never `fs.readFileSync` or `fs.writeFileSync` (ID: BTS-009)

**ALWAYS** use `Bun.build()` programmatic API for build pipelines — never webpack, rollup, or esbuild directly (ID: BTS-010)

**NEVER** use `import.meta.dir` in shared modules — it burns in the source path and breaks after bundling; use `new URL(import.meta.url).pathname` at entry points only (ID: BTS-011)

**ALWAYS** use `bun:test` for tests — `describe`, `it`, `expect`, `mock` (ID: BTS-012)

**NEVER** use class components in React — functional components with hooks only (ID: BTS-013)

**ALWAYS** validate environment variables with Zod at the process boundary — never read `process.env` directly in modules (ID: BTS-014)

**NEVER** use CSS-in-JS — vanilla CSS with BEM naming and CSS custom properties only (ID: BTS-015)

### TypeScript Configuration

The root `tsconfig.json` settings are non-negotiable. Package-level tsconfigs extend root and must not override these keys.

```json
{
  "compilerOptions": {
    "module": "Preserve",
    "verbatimModuleSyntax": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "moduleDetection": "force",
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true
  }
}
```

Discriminated union pattern (prefer over class hierarchies):

```typescript
type Result<T, E extends Error = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function parseConfig(raw: unknown): Result<AppConfig> {
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: new Error(parsed.error.message) };
  }
  return { ok: true, value: parsed.data };
}
```

`as const` union instead of enum:

```typescript
// CORRECT
const ItemPriority = { P0: "p0", P1: "p1", P2: "p2", P3: "p3" } as const;
type ItemPriority = (typeof ItemPriority)[keyof typeof ItemPriority];

// WRONG — never use enum
enum ItemPriority { P0 = "p0", P1 = "p1" }
```

Import order (enforced by `simple-import-sort`):
1. Side effects (`import "./styles.css"`)
2. Built-in modules (`node:path`, `node:fs`)
3. External packages (`react`, `ink`, `zod`)
4. Internal workspace packages (`@org/common`)
5. Parent-relative (`../utils`)
6. Same-folder relative (`./helpers`)
7. Type-only imports (always last with `import type`)

### Bun Runtime

HTTP server:

```typescript
import { type Server } from "bun";

const server: Server = Bun.serve({
  port: Number(Bun.env.PORT ?? 3000),
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Listening on ${server.url}`);
```

File I/O:

```typescript
// Read
const content = await Bun.file("path/to/file.toml").text();

// Write
await Bun.write("path/to/output.json", JSON.stringify(data, null, 2));

// Check exists
const exists = await Bun.file("path").exists();
```

Environment validation at the entry point:

```typescript
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().min(1024).max(65535).default(3000),
  QUEUE_ROOT: z.string().min(1),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export const env = EnvSchema.parse(Bun.env);
```

### Build Pipeline

Every `core/` or `packages/` entry with a runtime output needs this structure:

```typescript
// build/base.ts
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

// build/index.ts
import { createBaseConfig } from "./base";

const base = createBaseConfig();
const result = await Bun.build({
  ...base,
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  naming: "[dir]/[name].[ext]",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log(`built ${result.outputs.length} file(s)`);
```

`package.json` scripts pattern:
```json
{
  "scripts": {
    "build": "bun build/index.ts",
    "dev": "bun --watch src/index.ts",
    "typecheck": "tsc --noEmit"
  }
}
```

### React Conventions

Container/View separation:

```typescript
// Component.tsx — data, hooks, event handlers
import type { CardData } from "./types";
import { CardView } from "./View";
import { useCard } from "./useCard";

interface CardProps {
  id: string;
}

function Card({ id }: CardProps) {
  const { card, isLoading } = useCard(id);
  if (isLoading || !card) return null;
  return <CardView card={card} />;
}

export const Card = React.memo(Card);

// View.tsx — pure presentational, no hooks
interface CardViewProps {
  card: CardData;
}

function CardView({ card }: CardViewProps) {
  return (
    <article className="card">
      <h2 className="card__title">{card.title}</h2>
    </article>
  );
}

export const CardView = React.memo(CardView);
```

BEM CSS naming:

```css
/* Component.css */
.card {
  padding: var(--spacing-md);
  border-radius: var(--border-radius-sm);
}

.card--highlighted {
  border: 2px solid var(--color-accent);
}

.card__title {
  font-size: var(--font-size-lg);
  font-weight: 600;
}

.card__title--truncated {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

### Testing

```typescript
import { describe, it, expect, mock } from "bun:test";

describe("parseConfig", () => {
  it("returns ok result for valid input", () => {
    const result = parseConfig({ port: 3000, root: "/tmp" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.port).toBe(3000);
    }
  });

  it("returns error for invalid input", () => {
    const result = parseConfig({ port: -1 });
    expect(result.ok).toBe(false);
  });
});
```

## Common Mistakes

- **Using `import.meta.dir` in a shared module**: It resolves to the source path at bundle time and breaks when the package is installed elsewhere. Use `new URL(import.meta.url).pathname` in the runtime entry point only.
- **Using `any` to silence TypeScript errors**: Use `unknown` with a type guard, or define the proper interface. `any` defeats the type checker and hides bugs.
- **Using `enum` for string unions**: Enums have surprising runtime behavior (reverse mappings, nominal typing). Use `as const` + `typeof` pattern.
- **Default exports from shared utilities**: Default exports cannot be tree-shaken reliably and make refactoring harder. Named exports for everything shared.
- **Reading `process.env.FOO` directly in module scope**: Use a validated schema at the process entry point and export the typed env object. Accessing env directly spreads unvalidated strings across the codebase.
- **CSS-in-JS for component styles**: Use vanilla CSS with BEM naming. CSS-in-JS libraries add runtime overhead, inhibit SSR, and break the styling mental model.
- **`fs.readFileSync` / `fs.writeFileSync` in a Bun project**: Use `Bun.file().text()` and `Bun.write()`. They return Promises, support streaming, and are the idiomatic Bun way.
