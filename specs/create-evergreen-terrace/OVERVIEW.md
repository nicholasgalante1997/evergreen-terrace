# create-grove — Overview

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  evergreen-terrace (this repo)                                      │
│                                                                     │
│  ┌───────────────┐   ┌───────────────┐   ┌──────────────────────┐  │
│  │ core/         │   │ agents/       │   │ skills/ steering/    │  │
│  │ queue-server  │   │ pm            │   │ nick-voice       ✅  │  │
│  │ web           │   │ eng-senior    │   │ nick-conventions ✅  │  │
│  │ tui           │   │ eng-mid       │   │ bundt-context    ✅  │  │
│  │ sentinel      │   │ eng-junior    │   │ foresight-context✅  │  │
│  │ conductor     │   │ director      │   │                      │  │
│  │ metrics       │   │ stakeholder   │   │ [PERSONAL CONTEXT]   │  │
│  └───────────────┘   │ voice         │   └──────────────────────┘  │
│                      │ momentum-     │                              │
│  ┌───────────────┐   │ sentinel      │   ┌──────────────────────┐  │
│  │ packages/     │   └───────────────┘   │ context/projects/    │  │
│  │ common        │                       │ *.toml (Nick's)  ✅  │  │
│  │ config        │   ┌───────────────┐   └──────────────────────┘  │
│  └───────────────┘   │ templates/    │                              │
│                      │ steering/ ❌  │ ◀── NEW (SPEC_01)           │
│  ┌───────────────┐   │ skills/   ❌  │                              │
│  │ packages/     │   │ agents/   ❌  │                              │
│  │ create-et/ ❌ │◀──│ context/  ❌  │                              │
│  │ (SPEC_02)     │   └───────────────┘                              │
│  └───────┬───────┘                                                  │
└──────────┼──────────────────────────────────────────────────────────┘
           │ bunx create-grove my-org
           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  ~/my-org/  (consumer output)                                        │
│                                                                      │
│  ┌───────────────┐   ┌─────────────────┐   ┌──────────────────────┐ │
│  │ core/         │   │ agents/         │   │ skills/              │ │
│  │ [IDENTICAL]   │   │ agent.json →    │   │ voice/     GENERATED │ │
│  │               │   │ skills: [       │   │ conventions/GENERATED│ │
│  │               │   │   "voice",      │   └──────────────────────┘ │
│  │               │   │   "conventions" │                            │ │
│  │               │   │ ]               │   ┌──────────────────────┐ │
│  └───────────────┘   └─────────────────┘   │ steering/            │ │
│                                             │ project-context.md   │ │
│  ┌───────────────┐                         │   GENERATED          │ │
│  │ context/      │                         │ architecture-        │ │
│  │ projects/     │                         │   principles.md COPY │ │
│  │ my-project-   │                         │ code-style.md   COPY │ │
│  │   1.toml  ❌  │                         └──────────────────────┘ │
│  │ my-project-   │                                                   │
│  │   2.toml  ❌  │                                                   │
│  └───────────────┘                                                   │
└──────────────────────────────────────────────────────────────────────┘
           │
           ▼ bun run sync-agents
┌──────────────────────────┐
│  ~/.claude/agents/       │
│  pm.md   eng-senior.md   │
│  voice.md  ...           │
└──────────────────────────┘
```

## Goals

1. Enable any developer to stand up their own evergreen-terrace instance with zero manual file editing
2. Abstract the personal context boundary cleanly — infrastructure is generic, personal context is generated
3. Distribute as a single `bunx create-grove` command (published to npm)
4. Be purely additive to the existing repo — Nick's daily workflow is never disrupted
5. Phase 1 delivers the starter kit; Phase 2 delivers opinionated stack presets

## Current State Analysis

| Component | Status | Notes |
|---|---|---|
| Core infrastructure (queue, web, tui, sentinel, conductor, metrics) | ✅ Generic | No personal references; ready to distribute as-is |
| Agent role definitions (AGENT.md behavior contracts) | ✅ Generic | Role logic is portable |
| Agent wiring (agent.json skills refs) | 🔄 Needs abstraction | References `nick-voice`, `nick-conventions` by name |
| `steering/architecture-principles.md` | ✅ Generic | Usable as-is in consumer output |
| `steering/code-style.md` | ✅ Generic | Minor cleanup needed; no Nick-specific refs |
| `steering/project-context.md` | ❌ Personal | Must be generated per-consumer from wizard answers |
| `skills/nick-voice/` | ❌ Personal | Must be replaced with consumer's voice stub |
| `skills/nick-conventions/` | ❌ Personal | Must be replaced with stack-matched conventions skill |
| `skills/bundt-context/`, `skills/foresight-context/` | ❌ Personal | Project-specific; excluded from distribution |
| `context/projects/*.toml` | ❌ Personal | Generated from wizard projects list |
| `queue/inbox/`, `queue/active/` | ❌ Personal | Consumer starts with empty queue |
| `scripts/sync-agents.ts` | ✅ Generic | Works for any skill/steering layout |
| `packages/create-grove/` | ❌ Missing | New package; the subject of this spec |
| `templates/` | ❌ Missing | Template source files; new directory |

## Technology Stack

| Tool | Version | Purpose |
|---|---|---|
| Bun | >=1.3.13 | Runtime, package manager, test runner |
| TypeScript | ^5.7.3 | Language |
| `ink` | ^5.x | React-based terminal renderer (requires React 18) |
| `@inkjs/ui` | ^2.x | Pre-built ink prompt components (TextInput, Select, MultiSelect, ConfirmInput, Spinner) |
| `react` | ^18.3.x | Component model for ink (CLI context — not 19) |
| `picocolors` | ^1.x | Lightweight terminal color/style utilities for non-ink output |
| Handlebars-style token replacement | (no dep) | Template rendering via simple string replacement |
| npm | registry | Distribution target for `create-grove` |

## Component Architecture

```
packages/create-grove/
├── build/
│   ├── base.ts           createBaseConfig({ external: [] })
│   └── index.ts          concurrent_build(...)
├── src/
│   ├── index.ts          CLI entry point — arg parsing, wizard orchestration
│   ├── wizard.ts         @clack/prompts flow → WizardAnswers
│   ├── scaffold.ts       Copy infra, generate context files, install deps
│   ├── templates.ts      Template loading and {{token}} rendering
│   └── types.ts          WizardAnswers, ProjectEntry, StackPreset
└── package.json          bin: create-grove → dist/index.js

templates/                (sibling to agents/, skills/, steering/)
├── steering/
│   ├── project-context.md     {{tokens}} for name, org, projects
│   └── code-style.md          static copy (already generic)
├── skills/
│   ├── voice/
│   │   └── SKILL.md           stub with fill-in instructions
│   └── conventions/
│       ├── SKILL.bun-ts.md    Bun/TS/React preset (from nick-conventions, de-personalized)
│       ├── SKILL.rust.md      Rust/Actix preset
│       ├── SKILL.both.md      Bun/TS + Rust combined
│       └── SKILL.generic.md   Stack-neutral conventions
├── context/
│   └── project.toml           {{tokens}} for project fields
└── agents/
    └── overrides/             Generic agent.json variants (skills: ["voice","conventions"])
        ├── pm.json
        ├── eng-senior.json
        ├── eng-mid.json
        ├── eng-junior.json
        ├── director.json
        ├── stakeholder.json
        ├── voice.json
        └── momentum-sentinel.json
```

## Data Flow

```
CLI arg: output-dir-name
        │
        ▼
┌───────────────────┐
│ Wizard            │   @clack/prompts
│ - name            │──▶ WizardAnswers
│ - projects (n)    │
│ - stack preset    │
│ - integrations    │
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│ Scaffold          │
│ 1. mkdir output/  │
│ 2. copy infra     │   Copy: core/, packages/, internal/,
│    (exclusion     │         agents/*.md, turbo.json, etc.
│     list applied) │
│ 3. generate files │   Render templates with WizardAnswers tokens
│    from templates │
│ 4. write .env     │   QUEUE_ROOT=<output-abs-path>
│ 5. bun install    │   In output directory
│ 6. sync-agents    │   Register agents to ~/.claude/agents/
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│ Done              │
│ Print: next steps │
└───────────────────┘
```

## Success Criteria

### Phase Completion Gates

- [ ] **Phase 1A**: `templates/` directory exists with all template files; agent override configs reference generic skill names
- [ ] **Phase 1B**: `packages/create-grove/` builds cleanly via `bun build/index.ts`; `dist/index.js` exists
- [ ] **Phase 1C**: Wizard collects all required fields; dry-run prints resolved WizardAnswers without side effects
- [ ] **Phase 1D**: `bunx create-grove test-org` produces a valid output directory that passes `bun install`, `bun run typecheck`, and `bun run sync-agents` without error
- [ ] **Phase 2A**: Stack preset skill files pass review as genuinely useful generic conventions
- [ ] **Phase 2B**: Agent profile selection produces correct agent.json wiring in consumer output

### Quality Metrics

- [ ] Consumer setup time from `bunx create-grove` to running agents: under 3 minutes on a clean machine
- [ ] Zero file modifications required to Nick's existing `agents/`, `skills/`, `steering/`, or `core/` to ship Phase 1
- [ ] `bunx create-grove` works without `--yes` / noninteractive mode breaking (handles Ctrl+C gracefully)
- [ ] Consumer output passes `bun run typecheck` on first run without any edits
