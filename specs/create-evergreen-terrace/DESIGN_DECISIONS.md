# create-grove — Design Decisions

## Decision 1: Infrastructure Source Strategy (Clone vs Embed vs Copy)

**Question:** How does the CLI get the evergreen-terrace infrastructure files to copy into the consumer's output directory?

### Option A: Shallow GitHub clone at runtime ⭐⭐⭐⭐

The CLI runs `git clone --depth=1 https://github.com/<org>/evergreen-terrace` into a temp directory, copies from there, and cleans up.

```typescript
const proc = Bun.spawnSync(
  ["git", "clone", "--depth=1", "--single-branch", REPO_URL, tmpDir],
  { stdout: "pipe", stderr: "pipe" },
);
```

Pros:
- Consumer always gets the latest version of `core/`, `agents/`, etc.
- No bundling complexity — templates and infra stay in their natural locations
- Published npm package is small (just CLI + templates)
- Requires no special build step to embed infrastructure

Cons:
- Requires network access and git at scaffold time
- Ties CLI to a specific GitHub URL; breaks if repo moves
- Adds 5–15 seconds to scaffold time (clone overhead)

### Option B: Infrastructure embedded in npm package ⭐⭐⭐

Publish the full infrastructure alongside the CLI in the npm package (via `"files"` in package.json).

Pros:
- Works offline
- No GitHub URL dependency

Cons:
- npm package becomes very large (includes all `core/` compiled source, etc.)
- Consumer gets the version of infra at publish time, not the latest
- Publisher must re-publish CLI for every infrastructure update
- Creates strong coupling between CLI versioning and infrastructure versioning

### Option C: Separate `@evergreen-terrace/infrastructure` package ⭐⭐

Split infra into a separate npm package installed as a peer dependency.

Pros:
- Infrastructure can be updated independently of CLI
- Offline support

Cons:
- Most complex distribution model; two packages to publish and keep in sync
- Consumer runs `bunx create-grove` which then needs to resolve a second package

### Decision: Option A (shallow clone)

The clone approach keeps the CLI small, always delivers the latest infra, and avoids complex packaging. The GitHub URL is a constant in the source and documented as the single source of truth. If the repo moves, the URL is one-line change with a CLI patch release.

**Implementation rule:** The REPO_URL constant must live in `src/scaffold.ts` (not in shared config) and be documented in the package README. Scaffold failures from clone errors produce actionable error messages, not raw git stderr.

---

## Decision 2: Template Engine (Token Replacement Strategy)

**Question:** How are `{{TOKEN}}` values substituted in template files?

### Option A: Custom string replacement (no dependency) ⭐⭐⭐⭐⭐

```typescript
export function render(template: string, tokens: Record<string, string>): string {
  return Object.entries(tokens).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    template,
  );
}
```

Pros:
- Zero dependencies
- Bun-native (`String.replaceAll` is built-in)
- Trivially testable
- `{{TOKEN}}` syntax is readable in template files
- No template engine learning curve for future maintainers

Cons:
- No conditional logic, loops, or partials
- Complex rendering (e.g., a variable-length projects list) requires pre-rendering to a string before token substitution

### Option B: Handlebars ⭐⭐⭐

Full template engine with `{{#each}}`, `{{#if}}`, partials.

Pros:
- Handles loops and conditionals natively in templates
- `PROJECTS_LIST` could be a Handlebars each block instead of pre-rendered string

Cons:
- New dependency
- More complex templates are harder to read and diff
- Premature abstraction — the only "loop" in this spec is pre-rendered to a string before being inserted as a single `{{PROJECTS_LIST}}` token

### Option C: JSX/TSX template files ⭐⭐

Write templates as JSX, render to string with React.

Pros:
- Type-safe, composable

Cons:
- Templates are Markdown and TOML, not HTML — JSX is wrong tool
- Heavyweight for this use case

### Decision: Option A (custom string replacement)

The only non-trivial rendering case is the projects list, which is pre-rendered to a markdown string before being assigned to `PROJECTS_LIST`. This keeps the `render()` function and all templates simple. If template complexity grows to require loops or conditionals, add Handlebars at that point — not before.

**Implementation rule:** `render()` in `src/templates.ts` is a pure function, 5 lines max. Pre-render any arrays or complex values to strings before calling `render()`.

---

## Decision 3: TUI Framework (`ink` + `@inkjs/ui` + `picocolors`)

**Question:** How does the CLI render the interactive wizard and styled output?

### Option A: `ink` + `@inkjs/ui` + `picocolors` ⭐⭐⭐⭐⭐

```tsx
import { render, Box, Text } from "ink";
import { TextInput, Select, MultiSelect, ConfirmInput } from "@inkjs/ui";
import pc from "picocolors";

// Inside ink render tree: use <Text> props
<Text bold color="cyan">grove</Text>
<Select options={[{ label: "Bun/TS", value: "bun-ts" }]} onChange={handleStack} />

// Outside ink render tree: use picocolors
process.stdout.write(pc.dim("  Installing dependencies..."));
process.stdout.write(pc.green(" done\n"));
```

Pros:
- React component model: each wizard stage is a component; layout is declarative
- `@inkjs/ui` provides pre-built `TextInput`, `Select`, `MultiSelect`, `ConfirmInput`, `Spinner` — no custom prompt logic
- Receipt pattern (showing confirmed answers above current prompt) is trivial with component state
- `ConfirmStage` can render a bordered summary box using ink's `borderStyle` prop
- `picocolors` is tiny (~2kb) and handles the non-ink output (progress, banner, success screen) with zero config
- Ctrl+C via SIGINT handler before `exitOnCtrlC` fires — clean unmount + styled message

Cons:
- Heavier dependency set than `@inquirer/prompts`: `ink`, `@inkjs/ui`, `react`, `@types/react`
- ink requires React 18 specifically (not 19) — this package uses React 18, everything else uses 19
- Mixing picocolors escape codes inside ink components corrupts terminal layout (must enforce the boundary)

### Option B: `@inquirer/prompts` (sequential async)

```typescript
import { input, select, checkbox, confirm } from "@inquirer/prompts";
const name = await input({ message: "Your name", validate: ... });
```

Pros:
- Lighter dependency: one package
- Sequential `await` model is straightforward
- No React/JSX in a CLI context

Cons:
- No component state — "receipt" pattern (showing confirmed answers above current prompt) requires manual printing
- The summary confirmation screen cannot be easily bordered or laid out
- Progress output must use a separate library or raw `console.log`

### Decision: `ink` + `@inkjs/ui` + `picocolors`

The React component model is the right fit for a multi-stage wizard with dynamic layout (receipt lines, bordered summary, step indicators). The dependency cost is justified by the quality of the consumer experience — this is a product that represents the evergreen-terrace brand. `picocolors` handles the pre/post-ink output (banner, progress, success screen) with no additional complexity.

**Implementation rules:**
- `picocolors` is used **only outside the ink render tree** (`index.ts`, `scaffold.ts`, SIGINT handlers). Never call `pc.*` inside `components/`.
- Inside `components/`, style exclusively via ink `<Text color="..." dimColor bold>` props.
- `exitOnCtrlC: false` is set on `render()` so the SIGINT handler controls the cancellation message.
- ink components are in `src/components/`. `wizard.tsx` is the only file that calls `render()`.

---

## Decision 3b: React Version in CLI Package

**Question:** The repo uses React 19 for UI (`core/web/`). ink 5 requires React 18. Which version does `packages/create-grove` use?

### Decision: React 18 in this package only

ink 5 has a peer dependency on React 18. This is a CLI tool — it renders to the terminal, not a browser. It is a separate package from `core/web/` with its own `package.json` and `node_modules`. Using React 18 here does not affect the React 19 used elsewhere in the monorepo.

**Implementation rule:** `packages/create-grove/package.json` declares `"react": "^18.3.0"`. The root workspace does not hoist React — each package that needs React declares its own version. `turbo.json` does not need to change.

---

## Decision 4: Personal Skill Exclusion Strategy

**Question:** How does the scaffolding engine know which skills to exclude from the consumer output?

### Option A: Hardcoded exclusion list ⭐⭐⭐⭐

```typescript
const EXCLUDE: Set<string> = new Set([
  "skills/nick-voice",
  "skills/nick-conventions",
  "skills/bundt-context",
  "skills/foresight-context",
  // ...
]);
```

### Option B: Convention-based (prefix or marker file)

Skills prefixed with `nick-` are personal; others are generic. Or: skills with a `personal: true` marker in a config file are excluded.

Pros:
- Automatic — new personal skills are excluded by convention, not by updating a list

Cons:
- Requires naming discipline going forward
- Nick might add `nick-new-project-context` and it works, but also might add `bundt-context-v2` which breaks the prefix convention

### Option C: Allowlist (only include specific skills)

Only copy skills that are explicitly listed as distributable.

Pros:
- Tightest control — nothing gets through by accident

Cons:
- Requires updating the allowlist for every new generic skill added

### Decision: Option A (hardcoded exclusion list) for Phase 1

The exclusion list is small (4 personal skills) and changes slowly. Phase 1 uses a hardcoded list in `scaffold.ts`. If the number of personal skills grows significantly, revisit convention-based approach. Document the exclusion list in comments so the reason for each exclusion is clear.

**Implementation rule:** The exclusion list is a `const` at the top of `scaffold.ts`. Adding a personal skill to the repo requires also adding it to the exclusion list. Document this requirement in `CLAUDE.md` under "Adding personal skills."

---

## Decision 5: Package Name and Registry

**Question:** What is the package name and where is it published?

### Option A: `create-grove` on npm ⭐⭐⭐⭐

`bunx create-grove my-org` — matches the `create-*` convention for scaffolding tools (cf. `create-react-app`, `create-vite`, `create-next-app`).

### Option B: `@evergreen-terrace/create` on npm ⭐⭐⭐

Scoped package. More consistent with the monorepo's naming (`@evergreen-terrace/*`).

`bunx @evergreen-terrace/create my-org` — slightly more typing.

### Option C: `npx` compatibility via JSR ⭐⭐

Publish to JSR for Deno/Bun native registry compatibility. Still npm-compatible via compat layer.

### Decision: Option A (`create-grove`) for Phase 1

The `create-*` convention is universally understood and matches the UX pattern consumers expect. The tool is named **Grove** — short, minimal, and derived from the existing project aesthetic (evergreen terrace → a grove of evergreen trees). The command `bunx create-grove my-org` is immediately readable and the name behaves as a tool identity rather than an instance noun (consumers say "I use Grove", not "I spun up a grove").

**Implementation rule:** The npm package name is `create-grove`. The internal workspace package name (in `package.json` `"name"` field) matches. The local workspace (this repo) remains `evergreen-terrace` — Grove is the published tool name only.

**UI rule:** The wizard header displays `grove` (not `create-grove`). The `create-` prefix is a npm convention for the install command, not the product name.
