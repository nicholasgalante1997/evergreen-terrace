# SPEC_04 — Layout & Navigation Polish

## Context

This spec upgrades the overall page shell — the header, the queue layout grid, empty states, and loading skeletons. These are the surfaces every user sees regardless of which page they're on, and they set the first impression of the dashboard's quality level.

## Prerequisites

- SPEC_01, SPEC_02, SPEC_03 complete

## Requirements

### 1. Header Redesign

The header needs a cleaner wordmark, better tab spacing, and the ThemeToggle added in SPEC_02 incorporated properly.

```
┌─────────────────────────────────────────────────────────────────┐
│  ◈ evergreen-terrace │ Queue  Sentinel  Metrics  Events  Docs │ ○ │
└─────────────────────────────────────────────────────────────────┘
 ^wordmark + icon       ^tab nav, left-aligned                  ^toggle
```

Requirements:
- Add a small wordmark icon (◈ or a simple square SVG) before the title
- Wordmark uses `var(--font-sans)` at `var(--text-sm)` weight semibold
- Tab text uses `var(--font-sans)`, not uppercase, with `var(--weight-medium)`
- Active tab uses `border-bottom: 2px solid var(--accent)` and `color: var(--text-primary)`
- ThemeToggle is right-aligned in `.header__actions`
- Header height: 44px (unchanged — avoids layout shifts)

### 2. Sidebar Polish

```css
/* Cleaner section headers */
.sidebar__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-3) var(--space-2);
  font-family: var(--font-sans);
  font-size: 10px;
  font-weight: var(--weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  position: sticky;
  top: 0;
  background: var(--bg-surface);
  z-index: 1;
}

/* Tighter row layout */
.srow {
  padding: var(--space-2) var(--space-3);
  gap: var(--space-1);
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background 0.08s;
}

/* Selected state — cleaner stripe */
.srow--selected {
  background: var(--surface-selected);
  border-left: 2px solid var(--surface-selected-border);
  padding-left: calc(var(--space-3) - 2px);
}
```

Priority color dots — replace text badge with small colored circle:

```tsx
// QueueItem/View.tsx — SidebarRowView update
<span
  className={`srow__dot srow__dot--${p}`}
  aria-label={p}
  title={p.toUpperCase()}
/>
<span className="srow__title">{item.item.title}</span>
```

```css
.srow__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  margin-top: 1px;
}
.srow__dot--p0 { background: var(--status-p0); }
.srow__dot--p1 { background: var(--status-p1); }
.srow__dot--p2 { background: var(--status-p2); }
.srow__dot--p3 { background: var(--status-p3); }
```

### 3. Empty States

Replace raw text empty states with a structured component shape:

```tsx
// components/EmptyState/View.tsx
interface EmptyStateViewProps {
  message: string
  detail?: string
  action?: React.ReactNode
}

export function EmptyStateView({ message, detail, action }: EmptyStateViewProps) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">◈</div>
      <div className="empty-state__msg">{message}</div>
      {detail && <div className="empty-state__detail">{detail}</div>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  )
}
```

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 100%;
  padding: var(--space-8);
  text-align: center;
}

.empty-state__icon {
  font-size: 24px;
  color: var(--text-muted);
  opacity: 0.4;
  margin-bottom: var(--space-2);
}

.empty-state__msg {
  font-family: var(--font-sans);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  color: var(--text-secondary);
}

.empty-state__detail {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--text-muted);
  max-width: 320px;
}
```

Replace all `.feed--empty` inline messages and `.detail__empty` with `<EmptyState>`.

### 4. Loading Skeleton

For the queue sidebar list, replace `loading...` text with skeleton rows:

```tsx
// components/Skeleton/View.tsx
interface SkeletonViewProps {
  rows?: number
  className?: string
}

export function SkeletonView({ rows = 5, className }: SkeletonViewProps) {
  return (
    <div className={`skeleton ${className ?? ""}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton__row">
          <div className="skeleton__dot" />
          <div className="skeleton__line" style={{ width: `${60 + (i % 3) * 15}%` }} />
        </div>
      ))}
    </div>
  )
}
```

```css
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
}

.skeleton__dot,
.skeleton__line {
  border-radius: var(--radius-full);
  background: linear-gradient(
    90deg,
    var(--bg-raised) 25%,
    var(--border) 50%,
    var(--bg-raised) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

.skeleton__dot { width: 6px; height: 6px; flex-shrink: 0; }
.skeleton__line { height: 10px; flex: 1; }
```

### 5. Action Bar & Form Polish

```css
.action-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border);
  background: var(--bg-surface);
  flex-shrink: 0;
}

.action-bar__label {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.agent-select {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.agent-select:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--accent-subtle);
  outline: none;
}
```

## File Structure

```
core/web/src/
├── components/
│   ├── EmptyState/               ← NEW
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── View.tsx
│   │   ├── Component.tsx
│   │   └── EmptyState.stories.tsx
│   ├── Skeleton/                 ← NEW
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── View.tsx
│   │   ├── Component.tsx
│   │   └── Skeleton.stories.tsx
│   ├── Header/
│   │   └── View.tsx              ← MODIFIED: wordmark icon, ThemeToggle slot
│   └── QueueItem/
│       └── View.tsx              ← MODIFIED: dot indicator replaces priority text
└── index.css                     ← MODIFIED: layout + skeleton + empty state styles
```

## Acceptance Criteria

- [ ] Header renders wordmark + icon, tab nav, and ThemeToggle in a single row at 44px height
- [ ] Sidebar section headers are sticky within their scroll container
- [ ] Priority indicators are colored dots, not text abbreviations
- [ ] All empty state messages use `EmptyState` — no raw `<span>` or `<p>` for empty states remain
- [ ] Loading skeleton replaces loading text in the queue sidebar
- [ ] Action bar inputs use the focus ring from SPEC_03
- [ ] `bunx tsc --noEmit` passes
- [ ] Storybook stories exist for `EmptyState` and `Skeleton` covering all variants

## Verification

```bash
bunx tsc --noEmit -p core/web/tsconfig.json

# Check no raw "loading..." or similar in components
grep -rn '"loading\.\.\."' core/web/src/components/ --include="*.tsx"

# Storybook smoke test
cd core/web && bun run storybook --smoke-test
```
