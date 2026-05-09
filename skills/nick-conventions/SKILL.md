# nick-conventions

Code conventions, patterns, and preferences observed across Nick's active projects. Workers pull from this skill to ensure generated code matches the existing codebase style rather than introducing foreign patterns.

This skill is a living document. Update it as new patterns are established or old ones are retired.

---

## Runtime and Tooling

- **Runtime:** Bun first. Node.js only when a dependency forces it.
- **Package manager:** Bun for Bun-native projects. pnpm for legacy pnpm workspaces.
- **Monorepo:** Turbo for task orchestration. Workspaces defined in `package.json`.
- **Build:** Bun's native bundler for CLI/server packages. Webpack for legacy React apps. Vite for React SPAs.
- **TypeScript:** Strict mode. `moduleResolution: "bundler"` for Bun projects.

---

## TypeScript Conventions

### Types vs Interfaces

Use `interface` for object shapes that may be extended. Use `type` for unions, intersections, and aliases.

```ts
// Prefer
interface ComponentSnapshot {
  id: string;
  name: string;
  path: string;
}

// For unions
type BeadStatus = "pending" | "in_progress" | "completed" | "failed";
```

### Naming

- PascalCase for classes, interfaces, types, enums
- camelCase for variables, functions, methods
- SCREAMING_SNAKE_CASE for true constants (not config objects)
- Descriptive over terse — `componentAnalyzer` not `ca`, `inventoryBuilder` not `ib`

### Imports

Explicit named imports. No barrel re-exports that obscure origin. Group: external deps → internal packages → relative imports. Blank line between groups.

```ts
import { readFileSync } from "fs";
import { join } from "path";

import { parseToml } from "./toml";
```

### Error Handling

Explicit error types. Don't swallow errors silently. Use custom error classes for domain errors.

```ts
class AppError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "AppError";
  }
}
```

### Async

`async/await` over raw Promises. Avoid `.then()` chains. Use `Promise.all` for parallel independent operations.

---

## React Conventions

### Component Structure

Functional components only. Props interface defined above the component. Default exports for page-level components, named exports for shared components.

```tsx
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}

export function Button({ label, onClick, variant = "primary" }: ButtonProps) {
  return (
    <button className={`btn btn--${variant}`} onClick={onClick}>
      {label}
    </button>
  );
}
```

### State

Local `useState` for component-local state. Zustand for global/shared state. XState for complex multi-step workflow state.

### Styling

SCSS modules or CSS-in-JS (MUI's `sx` prop) depending on the project. Don't mix approaches within a project. Fidget/Kite design tokens for color, spacing, typography — never hardcoded values.

---

## CLI Conventions

- `commander` or `cac` for argument parsing
- `inquirer` for interactive prompts
- Chalk for terminal color
- Commands are classes or modules in `lib/commands/`
- Workers are separate from commands — commands orchestrate, workers execute

---

## File and Directory Structure

- `lib/` for library source code
- `src/` for application source code
- `bin/` for executable entry points
- `build/` for build configuration scripts
- `out/` for compiled output (gitignored)
- `scripts/` for one-off utility scripts

---

## Testing

Bun test for Bun-native projects. Vitest for Vite-based projects. Jest for legacy projects. Playwright for E2E. Tests live alongside source in `*.test.ts` files or in a top-level `tests/` directory.

---

## Rust Conventions

Used in `foresight` and Tauri widget backends. Key patterns observed in the codebase:

### Error handling
- **Library crates:** `thiserror` enums with typed variants and `#[from]` conversions. Never expose `rusqlite::Error` or `std::io::Error` directly — wrap them.
- **Application crates:** `anyhow` with `?` for propagation. `context("what failed")` to add callsite info.
- No `unwrap()` or `expect()` outside of `main()` initialization and tests.

```rust
// Library crate error (foresight-db pattern)
#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

// Application crate (foresight-agent pattern)
use anyhow::{Context, Result};
fn run() -> Result<()> {
    let db = Database::open().context("failed to open database")?;
    Ok(())
}
```

### Logging
`tracing` + `tracing-subscriber`. Never `println!()` or `log::info!()` in library code.

```rust
tracing::info!(pid = %snapshot.pid, name = %snapshot.name, "collected snapshot");
```

### Async
Tokio runtime. `#[tokio::main]` on binary entry. No blocking I/O (`std::fs`) in async contexts — use `tokio::fs`.

### Serialization
All persisted model structs derive `serde::Serialize, serde::Deserialize`. Use `chrono::DateTime<Utc>` for timestamps (with `features = ["serde"]`).

### Workspace deps
Declare all shared deps at root `Cargo.toml` `[workspace.dependencies]`. Crates reference them as `dep.workspace = true`.

---

## Documentation

Docsify or `@bundt/dxdocs` for project documentation sites. MDX for documentation with code examples. TOML for structured configuration data. README.md at repo root is required and kept current.

---

## What to Avoid

- `any` type — use `unknown` and narrow, or define the type
- Default exports for utility functions — named exports only
- Deeply nested ternaries — extract to a variable or function
- Inline styles in React — use className with CSS modules or design tokens
- `console.log` left in committed code — use a logger or remove
- Synchronous file I/O in hot paths — use async equivalents
