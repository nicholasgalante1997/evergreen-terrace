# SPEC_05 — Docs Section: Route & Navigation Structure

## Context

The system has detailed knowledge spread across `USER_MANUAL.md`, `.claude/workflows/`, and `specs/`. None of this is accessible from the running application — a new user (or a future-you after a break) has to go dig through files. This spec adds a `/docs` route with a navigation sidebar and renders guide content written in SPEC_06. The docs live in the app, versioned with the code.

## Prerequisites

- SPEC_01 (tokens — docs will use them)
- React Router route infrastructure is already established (Layout → Outlet → page routes)

## Requirements

### 1. Route Registration

```typescript
// routes/docs.ts
import { type RouteObject } from "react-router"

export default {
  path: "docs",
  children: [
    {
      index: true,
      lazy: {
        Component: async () => {
          const m = await import("@/pages/Docs")
          return "default" in m ? m.default : m
        },
      },
    },
    {
      path: ":slug",
      lazy: {
        Component: async () => {
          const m = await import("@/pages/Docs")
          return "default" in m ? m.default : m
        },
      },
    },
  ],
} as RouteObject
```

```typescript
// routes/index.ts — add DocsRoute to children
import DocsRoute from "./docs"

const rootRoute: RouteObject = {
  path: "/",
  Component: Layout,
  children: [QueueRoute, MetricsRoute, SentinelRoute, EventsRoute, DocsRoute],
}
```

### 2. Navigation Manifest

The manifest drives the sidebar and determines which slug maps to which content module. It is the single source of truth for docs structure.

```typescript
// src/docs/index.ts
export interface DocSection {
  slug: string
  title: string
  description: string
  group: string
}

export const DOC_SECTIONS: DocSection[] = [
  {
    slug: "getting-started",
    group: "Overview",
    title: "Getting Started",
    description: "Prerequisites, first-time setup, and starting the system",
  },
  {
    slug: "queue",
    group: "Core Concepts",
    title: "The Work Queue",
    description: "How items flow from inbox to active to completed",
  },
  {
    slug: "model-a",
    group: "Workflows",
    title: "Model A — Interactive",
    description: "Working with Claude Code directly, using queue items as briefs",
  },
  {
    slug: "model-b",
    group: "Workflows",
    title: "Model B — Conductor",
    description: "Automated dispatch, prompt review, streaming output, and review gates",
  },
  {
    slug: "sentinel",
    group: "Workflows",
    title: "Running the Sentinel",
    description: "Momentum scoring, reading reports, and managing project health",
  },
  {
    slug: "agents",
    group: "Reference",
    title: "Agent Roles",
    description: "Available agents, their models, tools, and when to use each",
  },
  {
    slug: "schema",
    group: "Reference",
    title: "Queue Item Schema",
    description: "TOML structure, field descriptions, and examples for all item types",
  },
]

export const DOC_GROUPS = [...new Set(DOC_SECTIONS.map((s) => s.group))]

// Dynamic import map — Vite processes these as code-split chunks
export async function loadDocContent(slug: string): Promise<{ default: React.ComponentType } | null> {
  const modules: Record<string, () => Promise<{ default: React.ComponentType }>> = {
    "getting-started": () => import("./getting-started"),
    "queue":           () => import("./queue"),
    "model-a":         () => import("./model-a"),
    "model-b":         () => import("./model-b"),
    "sentinel":        () => import("./sentinel"),
    "agents":          () => import("./agents"),
    "schema":          () => import("./schema"),
  }
  const loader = modules[slug]
  return loader ? loader() : null
}
```

### 3. DocsPage Component

```tsx
// pages/Docs.tsx
import { memo, useState, useEffect, useTransition } from "react"
import { useParams, useNavigate } from "react-router"
import { pipeline } from "@/utils/pipeline"
import { DOC_SECTIONS, DOC_GROUPS, loadDocContent } from "@/docs"
import { DocsSidebar } from "@/components/docs/DocsSidebar"

function DocsPageComponent() {
  const { slug = "getting-started" } = useParams<{ slug?: string }>()
  const navigate = useNavigate()
  const [Content, setContent] = useState<React.ComponentType | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    void loadDocContent(slug).then((mod) => {
      if (!cancelled && mod) {
        startTransition(() => setContent(() => mod.default))
      }
    })
    return () => { cancelled = true }
  }, [slug])

  const currentSection = DOC_SECTIONS.find((s) => s.slug === slug) ?? DOC_SECTIONS[0]!

  return (
    <div className="docs-layout">
      <DocsSidebar
        sections={DOC_SECTIONS}
        groups={DOC_GROUPS}
        activeSlug={slug}
        onNavigate={(s) => navigate(`/docs/${s}`)}
      />
      <main className="docs-content">
        <div className="docs-content__breadcrumb">
          <span>{currentSection.group}</span>
          <span className="docs-breadcrumb-sep">›</span>
          <span>{currentSection.title}</span>
        </div>
        <div className="docs-content__body">
          {isPending && <div className="docs-loading">Loading…</div>}
          {!isPending && Content && <Content />}
        </div>
      </main>
    </div>
  )
}

export default pipeline(memo)(DocsPageComponent)
```

### 4. DocsSidebar Component

```
components/docs/DocsSidebar/
  index.ts
  types.ts
  View.tsx
  Component.tsx
```

```typescript
// types.ts
import type { DocSection } from "@/docs"

export interface DocsSidebarViewProps {
  sections: DocSection[]
  groups: string[]
  activeSlug: string
  onNavigate: (slug: string) => void
}
```

```tsx
// View.tsx
import type { DocsSidebarViewProps } from "./types"

export function DocsSidebarView({ sections, groups, activeSlug, onNavigate }: DocsSidebarViewProps) {
  return (
    <nav className="docs-sidebar">
      <div className="docs-sidebar__title">Documentation</div>
      {groups.map((group) => (
        <div key={group} className="docs-sidebar__group">
          <div className="docs-sidebar__group-label">{group}</div>
          {sections.filter((s) => s.group === group).map((s) => (
            <button
              key={s.slug}
              className={`docs-sidebar__item ${activeSlug === s.slug ? "docs-sidebar__item--active" : ""}`}
              onClick={() => onNavigate(s.slug)}
            >
              {s.title}
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}
```

### 5. Keyboard Navigation

In `DocsPageComponent`, add keyboard shortcut for previous/next section:

```typescript
useEffect(() => {
  const idx = DOC_SECTIONS.findIndex((s) => s.slug === slug)
  const handler = (e: KeyboardEvent) => {
    if (e.altKey && e.key === "ArrowLeft"  && idx > 0) navigate(`/docs/${DOC_SECTIONS[idx - 1]!.slug}`)
    if (e.altKey && e.key === "ArrowRight" && idx < DOC_SECTIONS.length - 1) navigate(`/docs/${DOC_SECTIONS[idx + 1]!.slug}`)
  }
  window.addEventListener("keydown", handler)
  return () => window.removeEventListener("keydown", handler)
}, [slug, navigate])
```

### 6. CSS Layout

```css
.docs-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  height: 100%;
  overflow: hidden;
}

.docs-sidebar {
  border-right: 1px solid var(--border);
  background: var(--bg-surface);
  overflow-y: auto;
  padding: var(--space-4) 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.docs-sidebar__title {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  padding: 0 var(--space-4) var(--space-2);
}

.docs-sidebar__group {
  display: flex;
  flex-direction: column;
  margin-bottom: var(--space-3);
}

.docs-sidebar__group-label {
  font-family: var(--font-sans);
  font-size: 10px;
  font-weight: var(--weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding: var(--space-2) var(--space-4) var(--space-1);
}

.docs-sidebar__item {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: var(--weight-normal);
  color: var(--text-secondary);
  background: none;
  border: none;
  text-align: left;
  padding: var(--space-1) var(--space-4);
  cursor: pointer;
  border-radius: 0;
  transition: color 0.1s, background 0.1s;
}

.docs-sidebar__item:hover { color: var(--text-primary); background: var(--surface-hover); }

.docs-sidebar__item--active {
  color: var(--accent);
  background: var(--accent-subtle);
  font-weight: var(--weight-medium);
  border-left: 2px solid var(--accent);
  padding-left: calc(var(--space-4) - 2px);
}

.docs-content {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.docs-content__breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-8);
  border-bottom: 1px solid var(--border);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--text-muted);
  flex-shrink: 0;
  background: var(--bg-surface);
}

.docs-breadcrumb-sep { color: var(--border-strong); }

.docs-content__body {
  padding: var(--space-8);
  max-width: 720px;
}

.docs-loading {
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  padding: var(--space-4) 0;
}
```

### 7. Header — Add Docs Tab

```typescript
// Header/View.tsx — update TABS array
const TABS = [
  { label: "Queue",    path: "/" },
  { label: "Sentinel", path: "/momentum-sentinel" },
  { label: "Metrics",  path: "/metrics" },
  { label: "Events",   path: "/events" },
  { label: "Docs",     path: "/docs" },
]
```

Note: the active detection must match `/docs` as a prefix (not exact), since the sub-route is `/docs/:slug`:

```typescript
className={`tab-btn ${
  path === "/" ? pathname === "/" : pathname.startsWith(path)
    ? "tab-active" : ""
}`}
```

## File Structure

```
core/web/src/
├── docs/
│   └── index.ts                          ← NEW: manifest + loadDocContent
├── pages/
│   └── Docs.tsx                          ← NEW
├── routes/
│   ├── docs.ts                           ← NEW
│   └── index.ts                          ← MODIFIED: add DocsRoute
├── components/
│   └── docs/
│       └── DocsSidebar/                  ← NEW
│           ├── index.ts
│           ├── types.ts
│           ├── View.tsx
│           └── Component.tsx
└── index.css                             ← MODIFIED: docs layout styles
```

## Acceptance Criteria

- [ ] `GET /docs` renders and shows sidebar + first guide section (getting-started)
- [ ] `GET /docs/model-b` renders the Model B guide section
- [ ] Sidebar highlights the active slug
- [ ] Navigating between sections via sidebar does not trigger a full page reload
- [ ] `Alt+ArrowRight` / `Alt+ArrowLeft` navigates to next/previous section
- [ ] "Docs" tab appears in Header and highlights correctly when on any `/docs/*` path
- [ ] `bunx tsc --noEmit` passes

## Verification

```bash
bunx tsc --noEmit -p core/web/tsconfig.json

# Start dev server and confirm routes load
cd core/web && bun run dev
# Then: open http://localhost:2728/docs and /docs/model-b
```
