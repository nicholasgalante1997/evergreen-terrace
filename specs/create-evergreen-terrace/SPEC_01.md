# SPEC_01 — Template Abstraction Layer

## Context

The evergreen-terrace repo ships with personal context baked into skills and steering: `skills/nick-voice/`, `skills/nick-conventions/`, and `steering/project-context.md` are Nick-specific and cannot be distributed as-is. Agent wiring (`agent.json` files) hardcodes these skill names.

This spec defines the `templates/` directory — the generic source layer that the CLI uses to generate consumer-specific context. It also defines `templates/agents/overrides/` — agent config files wired to generic skill names (`voice`, `conventions`) instead of Nick's personal ones.

**Nothing in this spec modifies any existing file.** All deliverables are net-new.

## Prerequisites

None. This spec has no dependencies.

## Requirements

### 1. `templates/` Directory Root

Create a `templates/` directory at the repo root (sibling to `agents/`, `skills/`, `steering/`).

```
templates/
├── steering/
│   ├── project-context.md
│   └── code-style.md
├── skills/
│   ├── voice/
│   │   └── SKILL.md
│   └── conventions/
│       ├── SKILL.bun-ts.md
│       ├── SKILL.rust.md
│       ├── SKILL.generic.md
│       ├── SKILL.docker-linux.md
│       ├── SKILL.design-system.md
│       └── SKILL.turborepo.md
├── context/
│   └── project.toml
└── agents/
    └── overrides/
        ├── pm.json
        ├── eng-senior.json
        ├── eng-mid.json
        ├── eng-junior.json
        ├── director.json
        ├── stakeholder.json
        ├── voice.json
        └── momentum-sentinel.json
```

### 2. `templates/steering/project-context.md` — Token Template

Contains `{{double-brace}}` tokens replaced at scaffold time by the wizards `WizardAnswers`. Token names must exactly match the keys defined in SPEC_03.

Required tokens:

| Token | Replaced with |
|---|---|
| `{{USER_NAME}}` | `answers.userName` |
| `{{ORG_NAME}}` | `answers.orgName` |
| `{{PROJECTS_LIST}}` | Rendered markdown list of project entries |
| `{{STACK_SUMMARY}}` | Human-readable stack summary from preset |

Example structure (abbreviated):

```markdown
# Project Context

## Who This Is For

{{USER_NAME}}. {{ORG_NAME}} is a personal engineering org...

## Projects

{{PROJECTS_LIST}}

## The Stack

{{STACK_SUMMARY}}
```

The rendered `PROJECTS_LIST` block must produce one section per project:
```markdown
**{{project.name}}** (`{{project.repoPath}}`) — {{project.description}}. Priority: {{project.priority}}.
```

### 3. `templates/steering/code-style.md` — Static Copy

A verbatim copy of `steering/code-style.md`. Contains no Nick-specific references and is usable as-is. If `steering/code-style.md` is ever updated, this file should be updated in sync (documented in a `# NOTE` comment at the top of the template file).

### 4. `templates/skills/voice/SKILL.md` — Voice Stub

A stub pre-scaffolded with all the sections a trained voice skill needs. The agent can produce clean professional output from the defaults before the user populates it with their own writing samples. The full section structure is present so the stub is immediately useful and the upgrade path is clear.

`{{USER_NAME}}` is replaced at scaffold time.

The stub must contain all of the following sections with the indicated default content:

**`# voice`** — header with stub notice:
```markdown
# voice

This skill is a stub. Populate the sections below with writing samples and style
notes from {{USER_NAME}} to train the voice agent to match their register.

Until populated, the voice agent produces clean, direct, professional output using
the defaults below.
```

**`## Core Principle`** — default principle:
```markdown
## Core Principle

The goal is not to humanize text. It is to rewrite it as {{USER_NAME}} would have
written it from scratch — starting from the substance, not polishing the surface.

[Replace with a description of {{USER_NAME}}'s actual writing philosophy.]
```

**`## Voice Characteristics`** — default guidelines for each sub-section.
Required sub-sections with placeholder defaults:

- `### Sentence Structure` — "Short declarative statements as the default. Longer sentences when a technical explanation requires it, not for padding."
- `### Register` — "Shifts by context (email vs. Webex vs. PR description), but the underlying directness stays constant."
- `### Opinions` — "State them without hedging qualifiers. Prefer 'X is the right approach' over 'X might be worth considering'."
- `### Technical Explanations` — "Step by step. Trust the reader. Don't over-explain. Use code blocks for code."
- `### Endings` — "Stop when the content is done. No summary paragraph, no 'I hope this helps.'"

**`## What to Remove`** — pre-populated list of AI-generation artifacts to strip on sight:
```markdown
## What to Remove

Strip the following on sight when transforming AI-generated output:

- "I hope this helps" / "I hope this finds you well"
- "It's worth noting that" / "It's important to mention"
- "In conclusion" / "To summarize" / "In summary"
- "This is a great question"
- "Please don't hesitate to reach out"
- Passive voice where active is possible
- Bullet points for content that is actually prose
- Over-structured responses (headers for a 3-sentence answer)
- Hedging qualifiers: "I think," "it seems like," "might be worth considering"
- Filler acknowledgments: "Absolutely," "Great point," "You're right that"

[Add any additional phrases {{USER_NAME}} consistently removes.]
```

**`## Format Rules`** — default formatting rules:
```markdown
## Format Rules

- Prose for explanations and reasoning
- Bullets only when content is genuinely enumerable (steps, options, a true list)
- Headers only for multi-section documents — not for a single-topic response
- Code blocks for code, always
- Blockquotes for asides and caveats in longer-form writing

[Adjust based on {{USER_NAME}}'s actual formatting preferences.]
```

**`## Transformation Examples`** — placeholder section:
```markdown
## Transformation Examples

[Add before/after transformation examples from {{USER_NAME}}'s actual writing.
See the note above for the format to use.]
```

**`## Usage`** — when to apply / when not to apply:
```markdown
## Usage

Apply this skill when:
- Generating external-facing content (emails, Slack/Webex, stakeholder updates)
- Writing PR descriptions or MR summaries
- Producing ticket descriptions
- Writing documentation for other engineers

Do not apply this skill to:
- Internal agent-to-agent communication
- TOML/JSON/code output
- Log messages or system output
```

### 5. `templates/skills/conventions/` — Stack Preset Files

Four convention skill files, one per stack preset. Each is a self-contained capability skill following the same structured format as the global skills in `~/.claude/skills/` — not the prose narrative format of `skills/nick-conventions/`. These are behavioral directives for agents, not reference documents.

#### Required format for all four files

Every preset file must follow this structure:

```markdown
---
name: <slug>
description: <one-line summary of what the skill governs>
tags: [<relevant tags>]
---

# <Title>

## Priority
**Critical**  (or **High** where appropriate)

## Instructions

**ALWAYS** <directive> (ID: IDENTIFIER)
**NEVER** <directive> (ID: IDENTIFIER)
...

### <Domain Section>

<prose explanation if needed>

```code example```

### <Another Domain Section>

...

## Common Mistakes

- <mistake>: <why it's wrong and what to do instead>
```

Minimum requirements per file:
- Frontmatter with `name`, `description`, and `tags`
- At least 10 `**ALWAYS**` or `**NEVER**` directives, each with a unique `(ID: IDENTIFIER)` annotation
- At least 3 code examples showing correct patterns
- A `## Common Mistakes` section with at least 4 entries

#### `SKILL.bun-ts.md` — Bun / TypeScript / React preset

Synthesized from `~/.claude/skills/typescript-strict/SKILL.md` and `~/.claude/skills/bun-runtime/SKILL.md`, extended with the React conventions and evergreen-terrace tsconfig requirements.

**Must cover all of the following domains:**

TypeScript configuration:
- tsconfig required settings: `"module": "Preserve"`, `"verbatimModuleSyntax": true`, `"noUncheckedIndexedAccess": true`, `"moduleDetection": "force"` — these are non-negotiable (reference CLAUDE.md)
- `unknown` with type guards over `any`; `as const` union over `enum`; discriminated union pattern
- Import order: side effects → builtins → external → internal → parent → sibling → types (with `import type` for type-only)
- Named exports exclusively — no default exports

Bun runtime:
- `Bun.serve()` for HTTP servers — no express/fastify
- `Bun.file()` for file I/O — no `fs.readFileSync` / `fs.writeFileSync`
- `Bun.build()` programmatic API — entrypoints, outdir, target, external, naming pattern
- `bun:test` for tests — `describe`, `it`, `expect`, `mock`
- `Bun.env` for environment variables; validate with Zod at the boundary

React conventions:
- Functional components with hooks only — no class components
- Named exports for shared components; barrel `index.ts` for every component directory
- Vanilla CSS with BEM naming — no CSS-in-JS, no inline styles except truly dynamic values
- `React.memo` for optimization via `pipeline()` composition pattern

Build pipeline:
- Every `core/` package with a runtime entry needs `build/base.ts` + `build/index.ts` + `dist/` output
- `dev` scripts run source directly (`bun --watch`); `build` scripts produce `dist/index.js`

#### `SKILL.rust.md` — Rust / Actix-web / Tokio preset

Synthesized from `~/.claude/skills/rust-fundamentals/SKILL.md` and `~/.claude/skills/rust-web-dev/SKILL.md`, extended with the workspace conventions from evergreen-terrace and foresight.

**Must cover all of the following domains:**

Ownership and borrowing:
- `&str` over `String` in function parameters when ownership is not needed
- `impl Trait` in argument position for flexibility
- `?` operator for propagation — no `unwrap()` or `expect()` in production paths
- `clone()` is not a borrow checker fix — understand ownership first

Error handling:
- Library crates use `thiserror` enums with `#[from]` conversions and typed variants — never expose underlying errors directly
- Application crates use `anyhow` with `?` and `.context("what failed")` at callsites
- Both patterns shown with a concrete code example each

Async:
- Tokio runtime with `#[tokio::main]` on binary entry
- No blocking I/O (`std::fs`) in async contexts — use `tokio::fs`
- `tokio::try_join!` for concurrent independent operations

Logging:
- `tracing` + `tracing-subscriber` — never `println!()` or `log::info!()` in library code
- Structured fields: `tracing::info!(key = %value, "message")`

Serialization:
- All persisted model structs derive `serde::Serialize, serde::Deserialize`
- `chrono::DateTime<Utc>` for timestamps with `features = ["serde"]`

Workspace conventions:
- All shared deps declared at root `Cargo.toml` `[workspace.dependencies]`; crates use `dep.workspace = true`
- `#![warn(clippy::pedantic)]` enabled in all crates

Web service patterns (Actix-web):
- `web::Data<T>` for shared state; extract via `ctx.data::<T>()?` in handlers
- `sqlx::query_as!` for compile-time verified queries — never string interpolation in SQL
- `PgPoolOptions` with `max_connections` and `acquire_timeout` set — no bare `connect()`
- Handler signature pattern: `async fn handler(pool: web::Data<PgPool>, ...) -> Result<HttpResponse>`

#### `SKILL.generic.md` — Stack-neutral

A standalone capability skill for projects that don't fit the Bun/TS or Rust presets. Covers language-neutral engineering principles. Must not reference Bun-specific APIs, React, or Actix-web.

**Must cover all of the following:**

TypeScript strict mode (language-level only):
- `noImplicitAny`, `noImplicitReturns`, `noUncheckedIndexedAccess`, `strictNullChecks` — all required
- `unknown` with type guards over `any`
- `as const` objects or union types over `enum`
- `import type` for type-only imports

Naming and exports:
- Named exports only — no default exports for utilities or shared modules
- PascalCase for types/interfaces/classes; camelCase for functions/variables; SCREAMING_SNAKE for true constants

Error handling:
- Explicit typed errors — custom error classes or discriminated union result types
- No silent error swallowing (`catch` blocks must handle or rethrow)
- No `try/catch` as control flow for non-exceptional paths

Async:
- `async/await` over raw `.then()` chains
- `Promise.all` / `Promise.allSettled` for parallel independent operations
- Always await in `async` functions — no fire-and-forget unless explicitly intentional

Code hygiene:
- No comments unless the WHY is non-obvious (hidden constraint, subtle invariant, external bug workaround)
- No magic numbers — extract to named constants
- No `console.log` left in committed code — use a structured logger or remove

#### `SKILL.docker-linux.md` — Docker and Linux deployment

A generalized capability skill for containerized deployments on Linux. Must not reference any specific project's service names or databases. Synthesized from patterns observed across `deckvault`, `linux-system-monitor`, and `evergreen-terrace`.

**Must cover all of the following domains:**

Multi-stage builds:
- Rust: `builder` stage installs musl-dev + openssl-dev, builds `--release`; `runner` stage starts from `alpine` (not `rust:`), copies only the binary, removes `/var/lib/apt/lists/` after `apt-get`
- Bun/Node: `builder` stage copies package files and lockfile first (cache layer), runs install with `--frozen-lockfile`, then copies source and builds; `runner` stage copies only `dist/`, `public/`, `package.json`, and `node_modules`
- No multi-language Dockerfile — one Dockerfile per service
- Run as a non-root user in the runtime stage: `RUN addgroup -S app && adduser -S app -G app` then `USER app`

Compose orchestration:
- Named bridge network declared at top level; services reference it explicitly — no `network_mode: host` in production
- `depends_on` with `condition: service_healthy` for any service with a healthcheck
- All services get a `healthcheck` — test with `wget --no-verbose --tries=1 --spider` (busybox-compatible) or `curl -f` with `HEALTHCHECK` instruction in Dockerfile
- `restart: unless-stopped` on all production services
- `container_name` set explicitly on all services

Resource management:
- `deploy.resources.limits` set for cpu and memory on all production services
- `deploy.resources.reservations` set to half of limits
- Log rotation via `logging.driver: json-file` with `max-size: 10m` and `max-file: 3`

Environment variables:
- `.env.example` committed to repo; `.env` gitignored
- `env_file: - ./.env` in compose — never hardcode credentials in compose files
- All env vars in `.env.example` documented with comments indicating what each does

Profiles for optional services:
- Database seed/migration services use `profiles: [seed]` or `profiles: [migrate]` — not in the default `up`
- Run with `docker compose --profile seed up seed`

Dev override:
- `docker-compose.override.yml` (or `docker-compose.dev.yml`) for dev-only config: volume mounts for hot reload, `--watch` or `cargo-watch`, `NODE_ENV: development`, `RUST_LOG: debug`
- `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` for dev

**Must include code examples for:** Rust multi-stage Dockerfile, Bun multi-stage Dockerfile, compose service with healthcheck + `depends_on: condition: service_healthy`, non-root user pattern, dev override pattern.

#### `SKILL.design-system.md` — Design system conventions

A capability skill for building component libraries following the VOID design system architecture. Based on `project-arcturus/.claude/skills/design-system/` and `component-composition/` patterns.

**Must cover all of the following domains:**

Component architecture:
- Container/View separation: `Component.tsx` (data, hooks, JSDoc) + `View.tsx` (pure presentational, no hooks) + `types.ts` + `index.ts` (barrel) + `Component.css` + `Component.stories.tsx`
- `pipeline(React.memo)(Component)` for HOC composition in both container and view
- Never import CSS in `.tsx` files — exception is `.stories.tsx` files only
- CSS files live alongside components, not in a global `public/css/` directory in a component library context

Styling conventions:
- BEM naming with a project-specific prefix: `.prefix-button`, `.prefix-button--primary`, `.prefix-button--disabled`, `.prefix-button__icon`
- CSS custom properties from the design token package — never hardcode colors, spacing, or typography values
- `clsx` for conditional class assembly — never string concatenation for classnames
- No CSS-in-JS (styled-components, emotion, MUI sx) — vanilla CSS only

Design token integration:
- Tokens published as a separate package (e.g. `@project/tokens`) that exports a CSS file and TypeScript constants
- Import token CSS in Storybook preview, not in component files
- Token categories: `--color-*`, `--spacing-*`, `--font-*`, `--border-radius-*`, `--transition-*`
- Components reference tokens via `var(--token-name)` — never reference the token package's JS exports in components

Storybook integration:
- CSF3 format: `Meta<typeof Component>` + `StoryObj<typeof Component>` + named story exports
- `tags: ['autodocs']` on every component meta
- Import component CSS in the story file: `import './Component.css'`
- Cover all variants and states in stories — primary, secondary, disabled, loading, error where applicable
- Vite alias resolves token and CSS packages in `.storybook/main.ts` so Storybook can import them

Build and package configuration:
- Separate `bundle()` and `bundleCSS()` functions — JS and CSS built independently
- `Bun.Glob` to collect all `src/**/*.css` files into a single `dist/index.css`
- `package.json` exports field: `"."` for JS + `"./styles"` for CSS + `"./package.json"` for package.json
- `"type": "module"` and `"files": ["dist"]` in package.json
- Run `tsc --noEmit` after bundling to verify types

Testing:
- `bun:test` with `happy-dom` for component tests
- `@testing-library/react` for rendering and querying
- Test accessibility attributes: `aria-*`, `disabled`, `role`
- Co-locate tests in `__tests__/ComponentName.test.tsx`

**Must include code examples for:** complete BEM CSS with custom properties, `clsx` conditional classname usage, full Storybook CSF3 story, `bundleCSS()` with Bun.Glob, package.json exports field.

#### `SKILL.turborepo.md` — Turborepo monorepo conventions

A capability skill for Turborepo-orchestrated Bun monorepos. Synthesized from conventions observed in `bundt` and `evergreen-terrace`.

**Must cover all of the following domains:**

Workspace layout:
- `apps/` for deployable CLIs and servers; `packages/` for publishable libraries; `internal/` for private shared tooling — never mix these
- `"workspaces": ["apps/*", "packages/*", "internal/*"]` in root `package.json`
- Each package's `package.json` must have `"name"` with the workspace scope, `"type": "module"`, and `"version"`
- `tsconfig.json` in each package extends root `../../tsconfig.json` (or `../tsconfig.json` for top-level)

Task graph:
- `build` task: `dependsOn: ["^build"]` (topological), `outputs: ["dist/**"]`
- `typecheck` task: `dependsOn: ["^build"]` (must run after deps are built), `outputs: []`, `cache: false`
- `test` task: `dependsOn: ["build"]`, `outputs: []`, `cache: false`
- `dev` task: `persistent: true`, `cache: false`
- `clean` task: `cache: false`
- Never use `cache: true` on tasks that read from the filesystem at runtime or produce non-deterministic output

Build pattern for packages with a CLI or server entry:
- `build/base.ts` exports `createBaseConfig({ external: [...peerDeps] })` — shared Bun.build options
- `build/index.ts` calls `concurrent_build(...configs)` from the internal build-utils package
- `concurrent_build` runs `Promise.all(configs.map(Bun.build))`, throws on any failure, logs elapsed time
- `"build": "bun build/index.ts"` in package.json
- `"dev": "bun --watch src/index.ts"` runs source directly — never `dist/` in dev

Scoped commands:
- `turbo run build --filter=@scope/package` to build one package and its deps
- `turbo run build --filter=...@scope/package` to build a package and all packages that depend on it
- `turbo run build --filter=./apps/*` to build all apps

Changesets for versioning (OSS packages):
- `bunx changeset` to describe a change before merging
- `bun run version` bumps versions from pending changesets
- `bun run release` runs build → typecheck → publish
- Git tags: `@scope/package@version`
- Never manually edit `CHANGELOG.md` — changesets generates it

Package inter-dependencies:
- Sibling packages are listed in `devDependencies` (or `peerDependencies` for runtime deps) — Bun workspaces resolves them locally
- `"@scope/internal-build-utils": "workspace:*"` syntax for workspace references
- Internal packages are never published to npm — they exist only for DX within the monorepo

**Must include code examples for:** `turbo.json` task graph, `build/base.ts` with `createBaseConfig`, `build/index.ts` with `concurrent_build`, `package.json` with workspace exports.

### 6. `templates/context/project.toml` — Project TOML Template

```toml
[project]
name = "{{PROJECT_NAME}}"
repo = "{{PROJECT_REPO}}"
gitlab_url = ""
description = "{{PROJECT_DESCRIPTION}}"

[status]
priority = "{{PROJECT_PRIORITY}}"
phase = "active-feature"
last_touched = "{{TODAY}}"
health = "healthy"

[open_work]
jira_project = ""
open_items = 0
blocked = false
blocker_note = ""

[notes]
context = ""
next_action = ""
```

Tokens rendered per-project from the `WizardAnswers.projects` array.

### 7. `templates/agents/overrides/*.json` — Generic Agent Configs

Eight JSON files. Each is a copy of the corresponding `agents/{role}/agent.json` with skill names replaced:
- `nick-voice` → `voice`
- `nick-conventions` → `conventions`
- `bundt-context` → removed (not distributed)
- `foresight-context` → removed (not distributed)

The steering references (`project-context`, `architecture-principles`, `code-style`) remain unchanged — those file names are stable.

**pm.json:**
```json
{
  "name": "pm",
  "description": "Product manager agent. Turns rough ideas, stakeholder asks, or problem statements into structured PRDs and queue-ready tickets.",
  "model": "claude-sonnet-4-6",
  "tools": ["Read", "Write", "Bash", "Grep", "Glob"],
  "skills": ["voice", "conventions"],
  "steering": ["project-context", "architecture-principles"]
}
```

**eng-senior.json:**
```json
{
  "name": "eng-senior",
  "description": "Senior engineer agent. Owns architecture decisions, PR review, ADR authoring, and technical design. Reads the codebase before writing anything.",
  "model": "claude-opus-4-7",
  "tools": ["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
  "skills": ["conventions"],
  "steering": ["project-context", "architecture-principles", "code-style"]
}
```

**eng-mid.json:**
```json
{
  "name": "eng-mid",
  "description": "Mid-level engineer agent. Implements features from a clear spec. Reads the codebase, follows existing patterns, produces working code that matches the project's conventions.",
  "model": "claude-sonnet-4-6",
  "tools": ["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
  "skills": ["conventions"],
  "steering": ["project-context", "architecture-principles", "code-style"]
}
```

**eng-junior.json:**
```json
{
  "name": "eng-junior",
  "description": "Junior engineer agent. Handles boilerplate, test writing, scaffolding, and repetitive implementation tasks. Works from explicit instructions.",
  "model": "claude-sonnet-4-6",
  "tools": ["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
  "skills": ["conventions"],
  "steering": ["project-context"]
}
```

**director.json:**
```json
{
  "name": "director",
  "description": "Director-level challenge agent. Applies scope pressure, questions prioritization, and stress-tests decisions from a business and delivery perspective.",
  "model": "claude-sonnet-4-6",
  "tools": ["Read", "Grep", "Glob"],
  "skills": [],
  "steering": ["project-context", "architecture-principles"]
}
```

**stakeholder.json:**
```json
{
  "name": "stakeholder",
  "description": "Stakeholder communication agent. Translates technical work into business language. Writes status updates, escalation summaries, and executive-facing content.",
  "model": "claude-sonnet-4-6",
  "tools": ["Read", "Grep", "Glob"],
  "skills": ["voice"],
  "steering": ["project-context"]
}
```

**voice.json:**
```json
{
  "name": "voice",
  "description": "Human-readable transform agent. Rewrites AI-generated output in the user's natural register. Applied as a post-processing step on any external-facing content.",
  "model": "claude-sonnet-4-6",
  "tools": ["Read", "Grep", "Glob"],
  "skills": ["voice"],
  "steering": ["project-context"]
}
```

**momentum-sentinel.json:**
```json
{
  "name": "momentum-sentinel",
  "description": "Cross-project health monitor. Reads persistent context, scores project momentum, surfaces what's stale or needs prioritization.",
  "model": "claude-sonnet-4-6",
  "tools": ["Read", "Write", "Bash", "Grep", "Glob"],
  "skills": ["voice"],
  "steering": ["project-context", "architecture-principles"]
}
```

## File Structure

```
templates/                            (new directory at repo root)
├── steering/
│   ├── project-context.md            (token template)
│   └── code-style.md                 (static copy)
├── skills/
│   ├── voice/
│   │   └── SKILL.md                  (stub with USER_NAME token)
│   └── conventions/
│       ├── SKILL.bun-ts.md           (Bun/TS/React preset)
│       ├── SKILL.rust.md             (Rust/Actix/Tokio preset)
│       ├── SKILL.generic.md          (stack-neutral)
│       ├── SKILL.docker-linux.md     (Docker + Linux deployment)
│       ├── SKILL.design-system.md    (VOID design system conventions)
│       └── SKILL.turborepo.md        (Turborepo monorepo conventions)
├── context/
│   └── project.toml                  (token template)
└── agents/
    └── overrides/
        ├── pm.json
        ├── eng-senior.json
        ├── eng-mid.json
        ├── eng-junior.json
        ├── director.json
        ├── stakeholder.json
        ├── voice.json
        └── momentum-sentinel.json
```

## Acceptance Criteria

- [ ] `templates/` exists at repo root
- [ ] `templates/steering/project-context.md` contains all 4 required tokens: `{{USER_NAME}}`, `{{ORG_NAME}}`, `{{PROJECTS_LIST}}`, `{{STACK_SUMMARY}}`
- [ ] `templates/steering/code-style.md` is byte-identical to `steering/code-style.md` (or contains only a `# NOTE` header addition)
- [ ] `templates/skills/voice/SKILL.md` contains `{{USER_NAME}}` and all required sections: `## Core Principle`, `## Voice Characteristics`, `## What to Remove`, `## Format Rules`, `## Transformation Examples`, `## Usage`
- [ ] All 6 conventions skill files exist under `templates/skills/conventions/`
- [ ] Every conventions skill file has YAML frontmatter with `name`, `description`, and `tags` fields
- [ ] Every conventions skill file contains a `## Priority` section
- [ ] `SKILL.bun-ts.md` contains at least 10 `**ALWAYS**` or `**NEVER**` directives with `(ID:` annotations
- [ ] `SKILL.rust.md` contains at least 10 `**ALWAYS**` or `**NEVER**` directives with `(ID:` annotations
- [ ] `SKILL.generic.md` contains at least 8 `**ALWAYS**` or `**NEVER**` directives with `(ID:` annotations
- [ ] `SKILL.docker-linux.md` contains at least 10 `**ALWAYS**` or `**NEVER**` directives with `(ID:` annotations
- [ ] `SKILL.design-system.md` contains at least 10 `**ALWAYS**` or `**NEVER**` directives with `(ID:` annotations
- [ ] `SKILL.turborepo.md` contains at least 8 `**ALWAYS**` or `**NEVER**` directives with `(ID:` annotations
- [ ] Every conventions skill file contains a `## Common Mistakes` section with at least 4 entries
- [ ] `SKILL.bun-ts.md` covers: tsconfig (`Preserve`/`verbatimModuleSyntax`/`noUncheckedIndexedAccess`), `Bun.serve()`, `Bun.file()`, `Bun.build()`, `bun:test`, named exports, vanilla CSS/BEM
- [ ] `SKILL.rust.md` covers: `thiserror` (library) vs `anyhow` (application), no `unwrap()` in production, `tracing` logging, tokio async, `sqlx::query_as!`, workspace dep pattern
- [ ] `SKILL.generic.md` covers: TS strict flags, typed errors, no silent catch, `async/await`, named exports, no magic numbers
- [ ] `SKILL.docker-linux.md` covers: multi-stage Rust + Bun Dockerfiles, non-root user, named networks, `depends_on: condition: service_healthy`, `restart: unless-stopped`, resource limits, log rotation, dev override
- [ ] `SKILL.design-system.md` covers: BEM with project prefix, CSS custom properties, `clsx`, no CSS-in-JS, Container/View split, Storybook CSF3, CSS-only bundle, package exports field
- [ ] `SKILL.turborepo.md` covers: task graph (`build → typecheck → test`), `concurrent_build`, `createBaseConfig`, workspace layout (apps/packages/internal), scoped `--filter`, changesets
- [ ] `templates/skills/conventions/SKILL.bun-ts.md` contains zero occurrences of: `springfield`, `deckvault`, `fidget`, `foresight`, `nick`
- [ ] `templates/context/project.toml` contains all 5 project tokens: `{{PROJECT_NAME}}`, `{{PROJECT_REPO}}`, `{{PROJECT_DESCRIPTION}}`, `{{PROJECT_PRIORITY}}`, `{{TODAY}}`
- [ ] All 8 agent override JSON files exist under `templates/agents/overrides/`
- [ ] No override JSON file contains `nick-voice`, `nick-conventions`, `bundt-context`, or `foresight-context` in its `skills` array
- [ ] `git diff --name-only` after this spec shows zero modifications to files outside `templates/`

## Dependencies

None.

## Verification

```bash
# All template directories exist
ls templates/steering templates/skills/voice templates/skills/conventions \
   templates/context templates/agents/overrides

# Tokens present in project-context template
grep -c "{{USER_NAME}}\|{{ORG_NAME}}\|{{PROJECTS_LIST}}\|{{STACK_SUMMARY}}" \
  templates/steering/project-context.md

# Voice stub has all required sections
for section in "## Core Principle" "## Voice Characteristics" "## What to Remove" \
               "## Format Rules" "## Transformation Examples" "## Usage"; do
  grep -q "$section" templates/skills/voice/SKILL.md \
    && echo "PASS: $section" || echo "FAIL: missing $section"
done

# Conventions files have frontmatter
for f in templates/skills/conventions/SKILL.*.md; do
  head -1 "$f" | grep -q "^---" && echo "PASS: frontmatter $f" || echo "FAIL: no frontmatter $f"
done

# ALWAYS/NEVER directive counts
for f in templates/skills/conventions/SKILL.bun-ts.md \
         templates/skills/conventions/SKILL.rust.md \
         templates/skills/conventions/SKILL.docker-linux.md \
         templates/skills/conventions/SKILL.design-system.md; do
  count=$(grep -c "\*\*ALWAYS\*\*\|\*\*NEVER\*\*" "$f")
  echo "$f: $count directives (need >= 10)"
done
for f in templates/skills/conventions/SKILL.generic.md \
         templates/skills/conventions/SKILL.turborepo.md; do
  count=$(grep -c "\*\*ALWAYS\*\*\|\*\*NEVER\*\*" "$f")
  echo "$f: $count directives (need >= 8)"
done

# Common Mistakes sections present
for f in templates/skills/conventions/SKILL.*.md; do
  grep -q "## Common Mistakes" "$f" \
    && echo "PASS: Common Mistakes in $f" || echo "FAIL: missing in $f"
done

# Key coverage checks — bun-ts
for term in "Preserve" "verbatimModuleSyntax" "noUncheckedIndexedAccess" \
            "Bun.serve" "Bun.file" "Bun.build" "bun:test" "BEM"; do
  grep -q "$term" templates/skills/conventions/SKILL.bun-ts.md \
    && echo "PASS: $term" || echo "FAIL: missing $term in bun-ts"
done

# Key coverage checks — rust
for term in "thiserror" "anyhow" "unwrap" "tracing" "tokio" "query_as" "workspace = true"; do
  grep -q "$term" templates/skills/conventions/SKILL.rust.md \
    && echo "PASS: $term" || echo "FAIL: missing $term in rust"
done

# Key coverage checks — docker-linux
for term in "non-root\|adduser\|addgroup" "service_healthy" "restart: unless-stopped" \
            "max-size" "deploy.resources\|resources:" "env_file" "profiles:"; do
  grep -qE "$term" templates/skills/conventions/SKILL.docker-linux.md \
    && echo "PASS: $term" || echo "FAIL: missing $term in docker-linux"
done

# Key coverage checks — design-system
for term in "clsx" "var(--" "BEM\|prefix-" "Storybook\|stories" "bundleCSS\|Bun.Glob" "exports"; do
  grep -qE "$term" templates/skills/conventions/SKILL.design-system.md \
    && echo "PASS: $term" || echo "FAIL: missing $term in design-system"
done

# Key coverage checks — turborepo
for term in "dependsOn" "concurrent_build" "createBaseConfig" "persistent" "--filter" "changeset"; do
  grep -q "$term" templates/skills/conventions/SKILL.turborepo.md \
    && echo "PASS: $term" || echo "FAIL: missing $term in turborepo"
done

# No personal skill names in any override
grep -rn "nick-voice\|nick-conventions\|bundt-context\|foresight-context" \
  templates/agents/overrides/ && echo "FAIL: personal skill refs found" || echo "PASS"

# Conventions presets have no personal project refs
grep -rni "springfield\|deckvault\|fidget\|foresight\|nick" \
  templates/skills/conventions/ && echo "FAIL: personal refs found" || echo "PASS"

# All 8 override files present
ls templates/agents/overrides/ | wc -l   # expect: 8

# No modifications to existing files
git diff --name-only | grep -v "^templates/" && echo "FAIL: existing files modified" || echo "PASS"
```
