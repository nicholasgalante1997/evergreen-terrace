# Spec: UI Redesign + Docs Section

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    evergreen-terrace / core/web                  │
│                                                                   │
│  ┌─────────────┐   ┌──────────────────────────────────────────┐  │
│  │  index.css  │   │              React App                    │  │
│  │             │   │                                           │  │
│  │  :root {    │   │  Layout ─▶ Header (tabs + theme toggle)  │  │
│  │   tokens    │   │         └─▶ <Outlet>                     │  │
│  │  }          │   │              ├─ /          QueueView      │  │
│  │             │   │              ├─ /sentinel  SentinelView   │  │
│  │  [data-     │   │              ├─ /metrics   MetricsView    │  │
│  │  theme=     │   │              ├─ /events    EventsPage     │  │
│  │  "light"]   │   │              └─ /docs      DocsPage  ◀── NEW│
│  │  { overrides}   │                                           │  │
│  └─────────────┘   └──────────────────────────────────────────┘  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  Storybook 10  ─▶  stories per component (View layer only)  │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Goals

1. Replace the full-monospace VOID terminal aesthetic with a modern, minimal SaaS dashboard visual language that reads as intentional, not developer-tool-default
2. Implement first-class dark/light mode with CSS custom property theming, OS preference detection, and persistent user override
3. Introduce a proper design token hierarchy (primitive → semantic → component) that makes future theme changes a single-file edit
4. Add a `/docs` section with beginner-friendly guides, workflow walkthroughs, and reference content — living inside the app, not in a separate site

## Current State Analysis

| Area | Status | Notes |
|------|--------|-------|
| CSS custom properties | ✅ | Single `:root` block in `index.css` — good foundation |
| Design token structure | 🔄 | Flat, no semantic layer; primitive values used directly in components |
| Typography | ❌ | Global `font-family: monospace` — no prose face, no scale |
| Spacing system | ❌ | Ad-hoc pixel values throughout components |
| Dark mode | ❌ | Dark-only; no light mode; no toggle |
| Light mode tokens | ❌ | Does not exist |
| Color palette | 🔄 | GitHub-adjacent palette (--bg-base: #0d1117); works but not distinctive |
| Component hover/focus states | 🔄 | Inconsistent across components |
| Docs section | ❌ | Entirely missing — knowledge only lives in markdown files on disk |
| Theme persistence | ❌ | Not implemented |

## Technology Stack

| Tool | Version | Purpose |
|------|---------|---------|
| React | 19 | UI framework |
| React Router | 7 | Routing (Outlet-based nested routes) |
| Vite | 6 | Dev server + bundler |
| Bun | 1.3.x | Runtime, package manager |
| CSS Custom Properties | native | Theming (no preprocessor, no CSS-in-JS) |
| Storybook | 10.3.6 | Component development + Chromatic visual regression |
| Chromatic | 16.x | Visual diff on stories per PR |

## Component Architecture

```
core/web/src/
├── index.css                  ← single stylesheet; tokens defined here
├── layout/
│   └── Layout.tsx             ← adds theme toggle to Header props
├── components/
│   ├── Header/
│   │   ├── View.tsx           ← adds ThemeToggle button
│   │   └── types.ts           ← adds theme props
│   ├── ThemeToggle/           ← NEW: sun/moon icon button
│   │   ├── Component.tsx
│   │   ├── View.tsx
│   │   ├── types.ts
│   │   └── index.ts
│   └── docs/                  ← NEW: docs-specific components
│       ├── DocsSidebar/
│       ├── DocsPage/
│       └── DocsContent/
├── hooks/
│   └── useTheme.ts            ← NEW: manages theme state + persistence
├── pages/
│   └── Docs.tsx               ← NEW: docs page entry
├── routes/
│   └── docs.ts                ← NEW: /docs route
└── docs/                      ← NEW: guide content as TSX modules
    ├── index.ts               ← navigation manifest
    ├── getting-started.tsx
    ├── queue-workflow.tsx
    ├── model-a.tsx
    ├── model-b.tsx
    ├── sentinel.tsx
    ├── agents-reference.tsx
    └── queue-item-schema.tsx
```

## Data Flow — Theme System

```
OS preference (prefers-color-scheme)
         │
         ▼
   useTheme hook
   ├─ reads localStorage("et-theme")
   ├─ falls back to OS preference
   └─ sets document.documentElement.dataset.theme = "dark" | "light"
         │
         ▼
   CSS: [data-theme="dark"]  { --bg-base: ...; }
        [data-theme="light"] { --bg-base: ...; }
         │
         ▼
   All components read semantic tokens (--bg-surface, --text-primary...)
   Never hardcoded hex values
```

## Success Criteria

### Phase Completion Gates

- [ ] **Phase 1A (Tokens)**: `index.css` exports a complete two-theme token set; no hardcoded hex colors remain in component files; Storybook renders both themes via a global decorator
- [ ] **Phase 1B (Typography)**: Inter or Geist loaded via `@font-face`; `--font-sans` and `--font-mono` tokens defined; all prose content uses sans-serif; monospace confined to code/data contexts
- [ ] **Phase 1C (Components)**: All 7 component folders have updated View.tsx and stories with light + dark screenshots passing Chromatic diff
- [ ] **Phase 1D (Toggle)**: Theme toggle in Header; persists across reload; respects OS preference on first visit; no flash of wrong theme on load
- [ ] **Phase 2A (Route)**: `/docs` renders; linked from Header; lazy-loaded; breadcrumb nav works
- [ ] **Phase 2B (Content)**: All 7 guide documents written and rendered; sidebar navigation complete; mobile-readable

### Quality Metrics

- [ ] Lighthouse accessibility score ≥ 90 in both themes (color contrast AA)
- [ ] No raw hex values in component `.tsx` files (enforced by grep in CI)
- [ ] All existing Storybook stories pass after redesign (no regressions)
- [ ] Docs section content covers all workflows documented in `.claude/workflows/`
