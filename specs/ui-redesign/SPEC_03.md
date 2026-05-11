# SPEC_03 — Component Visual Refresh

## Context

With tokens and theming infrastructure in place, this spec refreshes the visual treatment of all existing components. The goal is not a full redesign of behavior — it is replacing hardcoded values with semantic tokens, updating typography (monospace → sans-serif where appropriate), polishing interactive states, and ensuring every component looks intentional in both themes.

## Prerequisites

- SPEC_01: New token set in `index.css`
- SPEC_02: Theme infrastructure active

## Requirements

### 1. Global Base Styles Update

```css
/* index.css — replace current :root block */
:root {
  font-size: var(--text-base);          /* 13px */
  font-family: var(--font-sans);        /* Inter — NOT monospace globally */
  line-height: var(--leading-normal);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: var(--text-primary);
  background: var(--bg-base);
}
```

All BEM classes in `index.css` must be updated to use semantic tokens (no hex, no raw pixel values that should come from the spacing scale).

### 2. Per-Component Requirements

#### Header

```css
.header {
  height: 44px;                          /* unchanged */
  padding: 0 var(--space-4);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  font-family: var(--font-sans);
}

.header__title {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-secondary);
  letter-spacing: 0.01em;
  font-family: var(--font-sans);        /* was monospace */
}

.tab-btn {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--text-secondary);
  border-bottom: 2px solid transparent;
  transition: color 0.12s, border-color 0.12s;
  padding: 0 var(--space-3);
}

.tab-btn:hover { color: var(--text-primary); }

.tab-btn.tab-active {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
}
```

#### Sidebar

```css
.sidebar { background: var(--bg-surface); border-right: 1px solid var(--border); }

.sidebar__section-header {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--text-muted);
  padding: var(--space-3) var(--space-3) var(--space-2);
  letter-spacing: 0.06em;
}

.srow { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border-subtle); }
.srow:hover { background: var(--surface-hover); }
.srow--selected { background: var(--surface-selected); border-left: 2px solid var(--surface-selected-border); }

.srow__title { font-family: var(--font-sans); font-size: var(--text-sm); }
.srow__meta  { font-family: var(--font-sans); font-size: var(--text-xs); color: var(--text-muted); }
```

#### Detail Panel (ItemDetail)

```css
.detail { background: var(--bg-base); }

.detail__title {
  font-family: var(--font-sans);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  line-height: var(--leading-snug);
}

.badge {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  border-radius: var(--radius-full);
  padding: 2px var(--space-2);
}

.badge--p0 { color: var(--status-p0); border-color: var(--status-p0); background: var(--status-p0-subtle); }
.badge--p1 { color: var(--status-p1); border-color: var(--status-p1); background: var(--status-p1-subtle); }
.badge--p2 { color: var(--status-p2); border-color: var(--status-p2); background: var(--status-p2-subtle); }

.content-section__label {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--text-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.content-section__body {
  font-family: var(--font-sans);    /* prose — not monospace */
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: var(--leading-relaxed);
  white-space: pre-wrap;
}
```

#### AgentFeed

```css
.feed { background: var(--bg-surface); border-left: 1px solid var(--border); }

.feed__header {
  background: var(--bg-raised);
  border-bottom: 1px solid var(--border);
  padding: var(--space-2) var(--space-3);
}

.feed__role {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--accent);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.feed__log { font-family: var(--font-mono); font-size: var(--text-xs); }

.feed__event--output .feed__event-content {
  font-family: var(--font-mono);    /* output stays monospace */
  color: var(--text-secondary);
}

.feed__event--status .feed__event-content {
  font-family: var(--font-sans);    /* status messages — prose */
  color: var(--accent);
}

/* Prompt review panel — use sans-serif for UI chrome, mono for prompt content */
.feed__prompt-label { font-family: var(--font-sans); }
.feed__prompt-textarea { font-family: var(--font-mono); }
.feed__sysprompt-pre  { font-family: var(--font-mono); }
```

#### Buttons (global)

```css
.btn {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-raised);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.1s, color 0.1s, border-color 0.1s, box-shadow 0.1s;
  white-space: nowrap;
}

.btn:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.btn:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.btn--primary {
  background: var(--accent);
  color: var(--text-inverse);
  border-color: var(--accent);
}
.btn--primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }

.btn--success { background: var(--status-p2); color: var(--text-inverse); border-color: var(--status-p2); }
.btn--danger  { background: var(--status-p0); color: var(--text-inverse); border-color: var(--status-p0); }
```

#### Form Inputs (selects, inputs)

```css
.agent-select,
input[type="text"],
input[type="number"],
input[type="datetime-local"] {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  padding: var(--space-1) var(--space-2);
  outline: none;
  transition: border-color 0.1s, box-shadow 0.1s;
}

input:focus,
select:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--accent-subtle);
}
```

### 3. Remove COMPAT Shim

After updating all component CSS to use the new semantic token names, remove the backward-compat shim added in SPEC_01.

### 4. Storybook Stories Update

Each component's `.stories.tsx` must add a `render` that shows both themes simultaneously, or rely on the Storybook toolbar added in SPEC_02. No new story shapes required — just confirm existing stories look correct in both themes and establish a Chromatic baseline.

## File Structure

```
core/web/src/
├── index.css                     ← MODIFIED: all BEM classes updated to semantic tokens
└── components/
    ├── Header/
    │   └── View.tsx              ← MODIFIED: font-family, ThemeToggle slot
    ├── QueueItem/
    │   └── View.tsx              ← MODIFIED: token cleanup
    ├── ItemDetail/
    │   └── View.tsx              ← MODIFIED: token cleanup, typography
    ├── AgentFeed/
    │   ├── View.tsx              ← MODIFIED: font separation (mono vs sans)
    │   ├── EventRow.tsx          ← MODIFIED: token cleanup
    │   └── PromptPanel.tsx       ← MODIFIED: token cleanup
    ├── HealthSparkline/
    │   └── View.tsx              ← MODIFIED: token cleanup
    ├── VelocityChart/
    │   └── View.tsx              ← token cleanup (Recharts inline colors → tokens)
    ├── AgeDistribution/
    │   └── View.tsx              ← token cleanup (Recharts inline colors → tokens)
    └── EventsExplorer/
        └── View.tsx              ← MODIFIED: token cleanup
```

## Acceptance Criteria

- [ ] `grep -rn '#[0-9a-fA-F]\{3,6\}' src/components/` returns no matches (no hardcoded hex in component TSX files)
- [ ] All prose content (titles, descriptions, labels, status messages) renders in `var(--font-sans)`
- [ ] Code/data content (event log output, prompt textarea, SQL editor, bead IDs) renders in `var(--font-mono)`
- [ ] All interactive elements have visible `:focus-visible` outlines using `var(--border-focus)`
- [ ] Light mode: all text passes WCAG AA contrast against its background
- [ ] Dark mode: all text passes WCAG AA contrast against its background
- [ ] Buttons use the button scale (not ad-hoc padding)
- [ ] `bunx tsc --noEmit` passes
- [ ] Storybook: all stories render without console errors in both Dark and Light Storybook toolbar modes

## Verification

```bash
# No hex colors in component files
grep -rn "#[0-9a-fA-F]\{3,6\}" core/web/src/components/ --include="*.tsx"

# Typecheck
bunx tsc --noEmit -p core/web/tsconfig.json

# Visual check — run Storybook and manually toggle theme for each component
cd core/web && bun run storybook
```
