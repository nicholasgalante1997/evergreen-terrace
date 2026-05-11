# SPEC_06 — Docs Content & Guides

## Context

The infrastructure exists (SPEC_05). This spec writes the seven guide documents. Each document is a React component that returns formatted JSX — no MDX toolchain, no external renderer. Content maps directly from the existing `USER_MANUAL.md` and `.claude/workflows/` markdown files already in the repo, rewritten for in-app rendering with proper formatting components.

## Prerequisites

- SPEC_05 complete: `/docs` route, manifest, `loadDocContent`, content rendering infrastructure

## Requirements

### 1. Docs Content Component Conventions

Each guide is a default-exported React component returning structured JSX using a shared set of prose components:

```tsx
// src/docs/getting-started.tsx (representative structure)
export default function GettingStarted() {
  return (
    <article className="guide">
      <h1 className="guide__title">Getting Started</h1>
      <p className="guide__lead">
        Prerequisites, first-time setup, and starting the system.
      </p>
      <section className="guide__section">
        <h2 className="guide__h2">Prerequisites</h2>
        <p>Before you can run anything, you need:</p>
        <ul className="guide__list">
          <li><code className="guide__code">bun</code> ≥ 1.3.13</li>
          <li>Claude Code CLI — <code className="guide__code">claude --version</code> must work</li>
          <li><code className="guide__code">ANTHROPIC_API_KEY</code> set in your environment</li>
        </ul>
      </section>
      {/* ... more sections */}
    </article>
  )
}
```

### 2. Shared Guide CSS

```css
.guide {
  font-family: var(--font-sans);
  color: var(--text-primary);
  line-height: var(--leading-relaxed);
}

.guide__title {
  font-size: var(--text-3xl);
  font-weight: var(--weight-bold);
  color: var(--text-primary);
  margin-bottom: var(--space-2);
  line-height: var(--leading-tight);
}

.guide__lead {
  font-size: var(--text-lg);
  color: var(--text-secondary);
  margin-bottom: var(--space-8);
  line-height: var(--leading-snug);
}

.guide__section { margin-bottom: var(--space-8); }

.guide__h2 {
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
}

.guide__h3 {
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  margin: var(--space-4) 0 var(--space-2);
}

.guide p { margin-bottom: var(--space-3); color: var(--text-secondary); }

.guide__list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: var(--space-2) 0 var(--space-4);
  padding-left: var(--space-4);
}

.guide__list li::before {
  content: "–";
  color: var(--text-muted);
  margin-right: var(--space-2);
}

.guide__code {
  font-family: var(--font-mono);
  font-size: 0.9em;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 1px var(--space-1);
  color: var(--accent);
}

.guide__pre {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  overflow-x: auto;
  line-height: var(--leading-relaxed);
  color: var(--text-secondary);
  margin: var(--space-3) 0;
}

.guide__callout {
  background: var(--accent-subtle);
  border-left: 3px solid var(--accent);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  padding: var(--space-3) var(--space-4);
  margin: var(--space-4) 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.guide__callout-label {
  font-weight: var(--weight-semibold);
  color: var(--accent);
  margin-bottom: var(--space-1);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.guide__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
  margin: var(--space-3) 0;
}

.guide__table th {
  text-align: left;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border);
}

.guide__table td {
  padding: var(--space-2) var(--space-3);
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-subtle);
}

.guide__table tr:hover td { background: var(--surface-hover); }
```

### 3. Content Requirements Per Guide

The content source for each guide is the existing documentation already in the repo. Agents authoring these guides **must read the source files first** and not invent content.

#### `getting-started.tsx`

**Source**: `USER_MANUAL.md` sections: Prerequisites, First-time setup, Starting the system, Accessing remotely

Covers:
- Prerequisites checklist (Bun version, Claude CLI, API key)
- `bun install`, `.env` setup, `QUEUE_ROOT`
- `bun run start` — what each service does, which port
- SSH tunnel setup for remote access
- Verifying everything is running with `mise run health`

#### `queue.tsx`

**Source**: `USER_MANUAL.md` sections: The web dashboard → Queue tab, Working with queue items, Item lifecycle

Covers:
- Dashboard layout (sidebar, detail, agent feed pane)
- Agent feed pane states (table from the current USER_MANUAL)
- Creating items: PM agent path and manual TOML path
- Inbox → Active → Completed lifecycle
- Priority levels (p0–p3) and what they mean
- Dispatching: agent selector, what happens with/without conductor running
- Manually marking complete vs. conductor auto-complete

#### `model-a.tsx`

**Source**: `USER_MANUAL.md` → Model A section; `.claude/workflows/model-a-assisted.md`

Covers:
- When to use Model A vs Model B
- Step-by-step: select item → read description + acceptance → note links → dispatch to Active → open Claude Code in project dir → paste context → work interactively → mark complete
- Using the ticket as a pre-written brief
- Tips for loading context files first

#### `model-b.tsx`

**Source**: `USER_MANUAL.md` → Model B section; `.claude/workflows/model-b-conductor.md`

Covers:
- When to use Model B (well-scoped, spec-complete tickets)
- The full flow: dispatch → prompt review → (edit if needed) → Dispatch → watch feed
- Prompt review panel explained: system prompt (what it is, why read-only), user prompt (editable, what to change)
- What the agent feed shows: tool call badges, streaming output, usage footer
- Review gate: what `review_pending` means, how to diff in the project repo, approve vs reject
- Retry flow for failed beads
- Common failure: missing `repo` field in project TOML

#### `sentinel.tsx`

**Source**: `USER_MANUAL.md` → Running the sentinel; Sentinel tab description

Covers:
- What the sentinel does (reads project TOMLs, runs git log, scores 4 dimensions)
- Running it: Run Now button vs `mise run sentinel-run`
- Reading the report: score ranges (0–49 stale, 50–74 at-risk, 75–100 healthy)
- MISALIGNMENT flags — what they mean and how to respond
- After the run: what gets updated (health scores in project TOMLs)
- What NOT to do: don't change priority manually based on the sentinel score alone

#### `agents.tsx`

**Source**: `CLAUDE.md` → Agent Roles table; `agents/*/AGENT.md` files (read each)

Renders as a table:

| Role | Model | Purpose | When to use |
|------|-------|---------|-------------|
| `pm` | sonnet-4-6 | PRD generation, queue item authoring | Creating well-specified tickets from rough ideas |
| `eng-senior` | opus-4-7 | Architecture decisions, PR review | Complex cross-cutting decisions |
| `eng-mid` | sonnet-4-6 | Feature implementation from spec | Standard feature/bug tickets |
| `eng-junior` | sonnet-4-6 | Boilerplate, tests, scaffolding | Mechanical repetitive work |
| `voice` | sonnet-4-6 | Rewrites output in Nick's register | Polishing external-facing content |
| `stakeholder` | sonnet-4-6 | Status updates in business language | Comms to non-technical audiences |
| `director` | sonnet-4-6 | Scope pressure, challenge | Stress-testing plans before committing |
| `momentum-sentinel` | sonnet-4-6 | Cross-project health scoring | Weekly momentum runs |

Plus: how to dispatch each via the agent selector, and what ticket types each is suited for.

#### `schema.tsx`

**Source**: `CLAUDE.md` → Queue Item Schema; `context/SCHEMA.md`

Renders the full TOML schema with field-level explanations as a reference table, then a complete annotated example for each ticket type (feature, bug, pm, research, ops).

```typescript
// Example rendered output shape:
// [item] section — field table
// [delegation] section — field table
// [context] section — field table
// Full example: feature ticket
// Full example: pm ticket
// Full example: research ticket
```

### 4. Content Quality Standards

- Every guide must be accurate against the **current running system** — read source files before writing, not from memory
- No generic placeholder text ("lorem ipsum", "coming soon", "TBD")
- Code blocks show real commands (`bun run start`, actual TOML examples from the repo)
- Callout boxes for important warnings (e.g., "verify project TOML has a `repo` field before dispatching feature tickets")
- Each guide reads in under 5 minutes — focus on what to do, not exhaustive API documentation

## File Structure

```
core/web/src/
├── docs/
│   ├── index.ts               ← from SPEC_05 — manifest
│   ├── getting-started.tsx    ← NEW
│   ├── queue.tsx              ← NEW
│   ├── model-a.tsx            ← NEW
│   ├── model-b.tsx            ← NEW
│   ├── sentinel.tsx           ← NEW
│   ├── agents.tsx             ← NEW
│   └── schema.tsx             ← NEW
└── index.css                  ← MODIFIED: .guide* classes added
```

## Acceptance Criteria

- [ ] All 7 guide files exist and export a default React component
- [ ] Each guide renders without React errors in the browser
- [ ] Content in `model-b.tsx` describes the `prompt_pending` → dispatch → streaming flow accurately (matches current conductor implementation)
- [ ] `agents.tsx` table reflects all 8 agent roles with correct models (sourced from `CLAUDE.md`)
- [ ] `schema.tsx` shows the current TOML schema (matches `CLAUDE.md` Queue Item Schema section)
- [ ] `getting-started.tsx` includes the SSH tunnel setup (from `USER_MANUAL.md`)
- [ ] No guide contains placeholder text ("TBD", "coming soon", "TODO")
- [ ] `guide__code` and `guide__pre` display in `var(--font-mono)`; body text in `var(--font-sans)`
- [ ] `bunx tsc --noEmit` passes

## Verification

```bash
bunx tsc --noEmit -p core/web/tsconfig.json

# Confirm no placeholder text
grep -rn "TODO\|TBD\|coming soon\|placeholder" core/web/src/docs/ --include="*.tsx"

# Confirm all 7 guide files exist
ls core/web/src/docs/*.tsx | wc -l   # should be 7

# Manual: open each /docs/:slug in browser and read through
```
