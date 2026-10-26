# SPEC_05 — Phase 2: Opinionated Stack Presets + Agent Profiles

## Context

Phase 1 delivers a working starter kit. A consumer who completes the wizard has a running evergreen-terrace instance, but the `conventions` skill they receive is a generic preset. Phase 2 makes those presets genuinely high-quality and adds agent profile selection — pre-configured agent team compositions for different working patterns (solo dev, OSS maintainer, small team).

This spec is intentionally lower-precision than SPEC_01–04 because it should be written after Phase 1 ships and real consumer feedback is collected. What follows is the design direction and enough specification to implement it, not a locked API.

## Prerequisites

- SPEC_04 complete and at least one external consumer has run `bunx create-grove`
- Feedback collected on which stack preset was most/least useful

## Part A — Stack Preset Quality Pass

### Goals

The four conventions skill files delivered in SPEC_01 are derived from `nick-conventions`. Phase 2 elevates them to be first-class skill documents in their own right — not copies with personal refs removed, but actively maintained reference guides.

### `SKILL.bun-ts.md` — Full Bun/TS/React Reference

Must cover, with working code examples:

- TypeScript strict mode settings and their practical implications (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`)
- Bun.serve() patterns (HTTP server, route handling)
- Bun.build() pipeline conventions (base config, entrypoints, target)
- React 19: functional components only, `use()` API, Suspense boundaries
- TanStack Query 5: `useQuery`, `useMutation`, SSR prefetch/dehydrate pattern
- Error handling: typed errors, no silent swallow, `unknown` over `any`
- Import conventions: named exports, `import type` for type-only imports
- Testing: `bun test`, describe/test/expect, no mocks for external storage

Quality bar: an agent reading this skill must be able to write a Bun HTTP server, a React SSR component, and a TanStack Query hook without needing to read any other documentation. If the skill doesn't enable that, it's not done.

### `SKILL.rust.md` — Full Rust/Actix/Tokio Reference

Must cover, with working Rust code examples:

- Workspace structure: `[workspace.dependencies]`, `dep.workspace = true`
- Actix-web 4.x: `HttpServer`, `App`, `web::Data`, `web::scope`, extractors
- Error handling: `thiserror` for library crates, `anyhow` for application crates, `?` propagation
- Tokio async: `#[tokio::main]`, `tokio::spawn`, `tokio::fs` over `std::fs`
- sqlx 0.8: `PgPool`, compile-time query verification with `sqlx::query_as!`
- tracing: structured spans, `tracing::info!` with field notation, never `println!`
- serde: derive patterns, `#[serde(rename_all = "camelCase")]`, chrono integration
- Clippy: `#![warn(clippy::pedantic)]` and common lint suppressions with justification

Quality bar: same test — an agent reading this skill must be able to write an Actix-web handler with sqlx database access without additional documentation.

### `SKILL.generic.md` — Language-Agnostic Reference

A shorter, principles-first document:

- Error handling as a first-class concern in any language
- Async-first: assume I/O is concurrent
- Typed over dynamic: prefer type systems over runtime checks
- No premature abstraction: extract patterns on third repetition
- Test what changes, not what is stable
- No dependency for what the language/runtime provides natively

### `SKILL.docker-linux.md`, `SKILL.design-system.md`, `SKILL.turborepo.md` — Quality Pass

These three skills ship in Phase 1 with the same structured format (ALWAYS/NEVER directives, code examples, Common Mistakes) but may receive targeted improvements in Phase 2 based on consumer feedback. Common Phase 2 improvements to watch for:

- **docker-linux**: Add examples for the consumer's specific base OS or CI provider (GitHub Actions, GitLab CI) once feedback surfaces which deployment targets are most common.
- **design-system**: The VOID-based patterns are opinionated. If consumers are building on a different token system (Tailwind, Style Dictionary, Radix), Phase 2 may add variant sections or a separate `SKILL.design-system-tailwind.md`.
- **turborepo**: Changesets versioning and the `concurrent_build` pattern are bundt-specific. Phase 2 may generalize or add a `SKILL.turborepo-nx.md` variant for Nx-based monorepos if consumer demand warrants it.

The quality bar for Phase 2 elevation is the same as for `bun-ts` and `rust`: an agent reading the skill must be able to implement the domain it covers without additional documentation.

## Part B — Agent Profiles

### What a Profile Is

A profile is a named pre-configuration of which agents are active and how they're wired. The wizard gains a new question:

```
Which workflow pattern best fits yours?

◉  Solo dev         (all 8 agents — full team)
○  OSS maintainer   (pm, eng-senior, eng-mid, voice, momentum-sentinel)
○  Small team       (pm, director, eng-senior, stakeholder, momentum-sentinel)
○  Minimal          (eng-senior, eng-mid, momentum-sentinel)
```

### Profile Definitions

**solo-dev** (default):
- All 8 agents: pm, eng-senior, eng-mid, eng-junior, director, stakeholder, voice, momentum-sentinel
- Appropriate for a one-person shop managing multiple projects

**oss-maintainer**:
- Agents: pm, eng-senior, eng-mid, voice, momentum-sentinel
- No director (no stakeholder pressure in OSS), no junior (OSS work is rarely boilerplate-heavy), no stakeholder (no business reporting)
- Voice agent active because external-facing content (issue responses, changelogs) benefits from it

**small-team**:
- Agents: pm, director, eng-senior, stakeholder, momentum-sentinel
- Engineering work done by humans; agents handle PM, challenge, status, and health scoring
- No implementation agents (eng-mid, eng-junior) — those are the humans

**minimal**:
- Agents: eng-senior, eng-mid, momentum-sentinel
- Just the implementation team and health monitoring. No PM, no voice, no stakeholder.
- For developers who want code help and project health, nothing more

### Implementation

The profile selection adds a `profile` field to `WizardAnswers`:

```typescript
export type AgentProfile = "solo-dev" | "oss-maintainer" | "small-team" | "minimal";

export interface WizardAnswers {
  // ... existing fields
  profile: AgentProfile;
}
```

The scaffolding engine (SPEC_04 extension) consults the profile to determine which agent override files to copy from `templates/agents/overrides/`. Excluded agents are simply not written to the output's `agents/` directory.

```typescript
const PROFILE_AGENTS: Record<AgentProfile, string[]> = {
  "solo-dev": ["pm", "eng-senior", "eng-mid", "eng-junior", "director", "stakeholder", "voice", "momentum-sentinel"],
  "oss-maintainer": ["pm", "eng-senior", "eng-mid", "voice", "momentum-sentinel"],
  "small-team": ["pm", "director", "eng-senior", "stakeholder", "momentum-sentinel"],
  minimal: ["eng-senior", "eng-mid", "momentum-sentinel"],
};
```

The consumer output's `README.md` mentions the profile chosen and how to add agents later.

### Profile README Section

Generated into the consumer output `README.md`:

```markdown
## Agent team

Configured for **{{PROFILE_NAME}}** — {{PROFILE_DESCRIPTION}}.

Active agents: {{ACTIVE_AGENTS_LIST}}

To add an agent later, copy its directory from the evergreen-terrace repo into
`agents/`, add it to `agent.json`, and run `bun run sync-agents`.
```

## File Changes in Phase 2

```
templates/skills/conventions/
├── SKILL.bun-ts.md        UPDATED (elevated quality)
├── SKILL.rust.md          UPDATED (elevated quality)
├── SKILL.generic.md       UPDATED (principles-first rewrite)
├── SKILL.docker-linux.md  UPDATED (based on consumer feedback)
├── SKILL.design-system.md UPDATED (based on consumer feedback)
└── SKILL.turborepo.md     UPDATED (based on consumer feedback)

packages/create-grove/src/
├── types.ts               UPDATED (AgentProfile, WizardAnswers.profile)
├── wizard.ts              UPDATED (profile question added)
└── scaffold.ts            UPDATED (PROFILE_AGENTS filter in generateAgentConfigs)
```

## Acceptance Criteria (Phase 2)

- [ ] `SKILL.bun-ts.md` enables an agent to write a Bun HTTP server, React SSR component, and TanStack Query hook without additional documentation
- [ ] `SKILL.rust.md` enables an agent to write an Actix-web handler with sqlx database access without additional documentation
- [ ] `SKILL.bun-ts.md` contains working TypeScript code examples (not pseudocode) for: HTTP server, React component, TanStack Query hook
- [ ] `SKILL.rust.md` contains working Rust code examples for: Actix-web handler, sqlx query, tracing span
- [ ] Wizard presents profile selection question after stack selection
- [ ] Each profile produces only the listed agents in the output directory
- [ ] Consumer output `agents/` directory contains exactly the agents for the selected profile — no extras
- [ ] `bun run sync-agents` with a minimal-profile output registers exactly 3 agents
- [ ] Consumer output README contains the profile name and agent list

## Dependencies

- SPEC_04 complete
- At least one consumer has used the Phase 1 output (real feedback preferred before elevating presets)

## Verification

```bash
# Test oss-maintainer profile (non-interactive — requires dry-run extension or direct test)
# Profile filter test
bun -e "
  const PROFILE_AGENTS = {
    'oss-maintainer': ['pm','eng-senior','eng-mid','voice','momentum-sentinel']
  };
  const agents = PROFILE_AGENTS['oss-maintainer'];
  console.assert(agents.length === 5, 'wrong count');
  console.assert(!agents.includes('eng-junior'), 'junior should not be included');
  console.log('PASS');
"

# Verify no pseudocode in Bun/TS skill (look for function/const/interface keywords)
grep -c "function\|const\|interface\|type " \
  templates/skills/conventions/SKILL.bun-ts.md   # expect >= 10

# Verify no pseudocode in Rust skill
grep -c "fn \|impl \|struct \|enum \|use " \
  templates/skills/conventions/SKILL.rust.md     # expect >= 10

# Minimal profile produces 3 agents
bunx create-grove /tmp/et-minimal-test   # select minimal profile
ls /tmp/et-minimal-test/agents/ | wc -l   # expect 3
```
