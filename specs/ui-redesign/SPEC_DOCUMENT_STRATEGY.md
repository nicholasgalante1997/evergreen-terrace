# Spec Document Strategy

## Dependency Graph

```
SPEC_01 (Token System)
  └─▶ SPEC_02 (Theme Infrastructure)
        └─▶ SPEC_03 (Component Refresh)
              └─▶ SPEC_04 (Layout & Navigation)
                    └─▶ SPEC_05 (Docs Route & Structure)
                          └─▶ SPEC_06 (Docs Content)

SPEC_01 must land first — all downstream specs depend on the token names it defines.
SPEC_05 and SPEC_06 are independent of SPEC_03/04 at the component level but
should be styled with the new tokens, so run after SPEC_01 at minimum.
```

## Phase Descriptions

### Phase 1 — Visual Redesign

| Spec | Focus | Deliverables |
|------|-------|-------------|
| SPEC_01 | Design token system | New `index.css` `:root` block; semantic token layer; dark + light value sets; typography + spacing scales |
| SPEC_02 | Theme infrastructure | `useTheme` hook; `[data-theme]` attribute switching; OS preference detection; localStorage persistence; no-FOUC inline script |
| SPEC_03 | Component visual refresh | Updated View.tsx for all 7 components; new hover/focus/active states; polished form inputs; updated Storybook stories with theme switcher |
| SPEC_04 | Layout & navigation | Header redesign (wordmark, tab nav, theme toggle); sidebar polish; empty states; loading skeletons; responsive considerations |

### Phase 2 — Docs Section

| Spec | Focus | Deliverables |
|------|-------|-------------|
| SPEC_05 | Docs route and structure | `/docs` route; `DocsPage` component; sidebar nav driven by manifest; breadcrumb; keyboard nav between sections |
| SPEC_06 | Content and guides | 7 guide documents covering: Getting Started, Queue workflow, Model A, Model B Conductor, Sentinel, Agent reference, Queue item schema |

## Exit Criteria

### Phase 1 Exit

- [ ] `bunx tsc --noEmit` passes across all packages
- [ ] `bun run storybook` starts and all stories render without console errors
- [ ] Chromatic baseline established for both `data-theme="dark"` and `data-theme="light"` in CI
- [ ] `grep -r '#[0-9a-fA-F]\{3,6\}' src/components/` returns no matches (no hardcoded hex in components)
- [ ] Theme toggle is visible in Header; clicking it persists across hard reload
- [ ] First load with no `localStorage` entry uses OS preference (`prefers-color-scheme`)

### Phase 2 Exit

- [ ] `GET /docs` renders without a 404
- [ ] All 7 guide sections are reachable from the docs sidebar
- [ ] Docs content is accurate against current system state (verified against `.claude/workflows/` and `USER_MANUAL.md`)
- [ ] No broken links in the docs sidebar navigation
- [ ] Docs page is readable on a 1280px viewport without horizontal scroll

## Execution Strategy

```
Week 1
  Day 1-2  ├─ SPEC_01: Tokens (1 CSS file edit, high leverage)
  Day 2-3  ├─ SPEC_02: Theme infra (1 hook + Layout change)
  Day 3-5  └─ SPEC_03: Component refresh (7 components, parallelizable)

Week 2
  Day 1-2  ├─ SPEC_04: Layout + navigation
  Day 2-3  ├─ SPEC_05: Docs route + structure (can run parallel with SPEC_04)
  Day 3-5  └─ SPEC_06: Content (can run parallel with SPEC_04)
```

SPEC_03 components are independent of each other and can be parallelized across
multiple agent sessions (one component per bead in conductor mode).

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Flash of unstyled theme (FOUC) on load | High | Medium | Inline `<script>` in `index.html` sets `data-theme` before React hydrates |
| Token rename breaks existing component CSS | Medium | High | Run SPEC_01 with a compatibility shim: keep old names as aliases until SPEC_03 is complete |
| Chromatic baseline churn (every component changes) | High | Low | Accept baseline once per component after SPEC_03; treat as intentional |
| Font loading causes layout shift | Medium | Low | Use `font-display: swap`; set `size-adjust` to match fallback metrics |
| Docs content becomes stale as system evolves | Low | Medium | Docs source lives in `src/docs/*.tsx` — co-located with code; reviewed on PRs touching relevant features |
| Light mode color contrast failures | Medium | Medium | Validate against WCAG AA during SPEC_01 before any component work |

## Rollback Plan

**Phase 1 rollback**: `index.css` is the single point of change for tokens. Reverting to the current `:root` block restores all colors. Component `.tsx` files should not contain hex values after SPEC_01 — rollback is a one-file revert.

**Phase 2 rollback**: The docs route and all content live in `src/docs/` and `src/pages/Docs.tsx`. Removing the route from `routes/index.ts` and deleting the files returns to the current state with no impact on other features.
