# create-grove — Spec Document Strategy

## Dependency Graph

```
Phase 1A          Phase 1B          Phase 1C          Phase 1D
─────────         ─────────         ─────────         ─────────
SPEC_01           SPEC_02           SPEC_03           SPEC_04
Template          CLI Package       Wizard            Scaffolding
Abstraction  ──▶  Build Pipeline ──▶  Flow        ──▶  Engine
Layer                               (data                │
                                    collection)          │
                                                         ▼
                                                   Consumer output
                                                   validated end-to-end

Phase 2A          Phase 2B
─────────         ─────────
SPEC_05a          SPEC_05b
Stack             Agent
Presets      ──▶  Profiles
(conventions)     (wiring)
```

SPEC_01 has no dependencies — it's purely additive file creation.
SPEC_02 depends on SPEC_01 (templates must exist for the build to reference them).
SPEC_03 depends on SPEC_02 (wizard is a module within the CLI package).
SPEC_04 depends on SPEC_01 + SPEC_03 (scaffolding reads templates and wizard output).
SPEC_05 depends on SPEC_04 validated and shipped.

## Phase Descriptions

### Phase 1A — Template Abstraction Layer (SPEC_01)

| Spec | Focus | Deliverables |
|---|---|---|
| SPEC_01 | Create `templates/` and generic agent configs | Template files, agent override JSONs, no code changes |

**Purely file creation. Zero modifications to existing repo files.**

### Phase 1B — CLI Package + Build Pipeline (SPEC_02)

| Spec | Focus | Deliverables |
|---|---|---|
| SPEC_02 | Scaffold `packages/create-grove/` | package.json, build pipeline, empty src stubs, typecheck passing |

**Infrastructure only. No wizard logic yet.**

### Phase 1C — Wizard Flow (SPEC_03)

| Spec | Focus | Deliverables |
|---|---|---|
| SPEC_03 | Interactive prompt collection via `@clack/prompts` | `wizard.ts`, `types.ts`, dry-run mode, WizardAnswers type |

**Wizard completes and prints resolved answers. No file generation yet.**

### Phase 1D — Scaffolding Engine (SPEC_04)

| Spec | Focus | Deliverables |
|---|---|---|
| SPEC_04 | Copy infra + render templates → consumer output | `scaffold.ts`, `templates.ts`, end-to-end `bunx` flow working |

**Phase 1 complete when this passes end-to-end verification.**

### Phase 2 — Opinionated Defaults (SPEC_05)

| Spec | Focus | Deliverables |
|---|---|---|
| SPEC_05a | Stack preset conventions skills | `templates/skills/conventions/*.md` for all 4 stacks |
| SPEC_05b | Agent profiles | Profile presets, wizard profile question, profile-to-agent-config mapping |

## Exit Criteria

### Phase 1A Exit

- [ ] `templates/` directory exists at repo root with all template files listed in SPEC_01
- [ ] `templates/agents/overrides/` contains all 8 agent JSON files with generic skill refs
- [ ] `git diff --name-only` shows zero modifications to any file outside `templates/`

### Phase 1B Exit

- [ ] `bun --cwd packages/create-grove run build` exits 0
- [ ] `packages/create-grove/dist/index.js` exists
- [ ] `bun run typecheck` at repo root exits 0

### Phase 1C Exit

- [ ] `bun run packages/create-grove/src/index.ts --dry-run` runs the full wizard and prints `WizardAnswers` as JSON without creating files
- [ ] Ctrl+C at any prompt exits cleanly with "Cancelled" message and exit code 1
- [ ] Required fields (name, orgName, at least one project) block submission if empty

### Phase 1D Exit

- [ ] `bunx create-grove test-output` produces a valid directory
- [ ] `bun install` in the output directory exits 0
- [ ] `bun run typecheck` in the output directory exits 0
- [ ] `bun run sync-agents` in the output directory exits 0 and writes all 8 agent files to `~/.claude/agents/`
- [ ] `bun run queue` in the output directory starts the queue server on port 2727
- [ ] Output directory contains zero files with `nick-` prefixed skill references
- [ ] Output directory contains no personal project TOMLs from Nick's `context/projects/`

### Phase 2 Exit

- [ ] `conventions` skill for all 4 stack presets reviewed and confirmed as useful to a developer unfamiliar with Nick's projects
- [ ] Agent profile selection in wizard produces correct agent.json files with correct skill wiring
- [ ] README in consumer output references profile name chosen during setup

## Execution Strategy

```
Week 1
──────────────────────────────────────────────────────▶
  [SPEC_01]────────────────────┐
  Template files created        │
  (no code, pure content)       │
                                ▼
                          [SPEC_02]──────────────────────┐
                          CLI package scaffold             │
                          build pipeline                   │
                                                          ▼
                                                    [SPEC_03]──────┐
                                                    Wizard flow      │
                                                                     ▼
Week 2                                                        [SPEC_04]
────────────────────────────────────────────────────────────────────▶
                                                              Scaffolding
                                                              engine +
                                                              end-to-end
                                                              verification

Week 3+ (post-Phase-1 feedback)
──────────────────────────────────────────────────────▶
  [SPEC_05a]──────────────────────────▶[SPEC_05b]
  Stack presets                          Agent profiles
```

SPEC_01 can be done in parallel with everything in the existing codebase since it creates new files only.
SPEC_02–04 are sequential within the new package.

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Template content becomes stale relative to actual skills/steering | High | Medium | Add `bun run validate-templates` script in SPEC_04 that diffs template files against source equivalents and warns on divergence |
| Consumer's QUEUE_ROOT moves; breaks all services | Medium | Medium | Write QUEUE_ROOT to `.env` using abs path; document in consumer README with recovery instructions |
| `bun run sync-agents` fails during scaffolding (missing HOME, permissions) | Low | High | Scaffolding engine catches the error, prints manual instructions, continues — sync failure is non-fatal |
| npm publish friction (name conflict, 2FA, etc.) | Medium | Medium | Spec package as `@evergreen-terrace/create` if `create-grove` is taken; test publish to verdaccio locally first |
| Phase 2 stack presets are too generic to be useful | Medium | Medium | Seed presets from real `nick-conventions` content, de-personalized — don't start from scratch |
| Consumer hits Claude Code auth failure on first agent run | High | Low | Scaffold README warns upfront: "Claude Code CLI must be authenticated before agents work" with link to CC docs |

## Rollback Plan

**Phase 1A rollback:** `rm -rf templates/` — zero impact on existing repo.

**Phase 1B rollback:** Remove `packages/create-grove/` from `package.json` workspaces, delete directory. No other packages depend on it.

**Phase 1C/1D rollback:** Same as 1B — the package is self-contained.

**Phase 2 rollback:** Template files are additive. Remove new `SKILL.*.md` files from `templates/skills/conventions/`. Wizard profile question can be removed with a one-line diff to `wizard.ts`.

No phase of this spec touches `core/`, `agents/`, `skills/`, `steering/`, or any existing runtime package. Rollback is always `rm -rf` on new files only.
