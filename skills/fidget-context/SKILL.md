# fidget-context

Deep context for the Fidget/Kite design system. Read this before working on any task that involves design tokens, CSS variables, component styling, or Figma integration in agent-os or related projects.

---

## What Fidget Tokens Is

A three-layer design system monorepo that maintains design tokens as JSON, automates conversion to multiple platform formats via Style Dictionary, and provides a CSS foundation and React component library built on those tokens.

**Repository:** `/Users/P3062609/dev/agent-tools-ds/fidget-tokens`

**Package manager:** pnpm (workspace). **Build orchestration:** Turbo. **Runtime:** Bun.

---

## The Three Layers

```
@fidget-tokens/components   — React component library (Button, Card, Badge, Input, ...)
@fidget-tokens/css          — CSS foundation (reset, base, layout, forms, components)
@fidget-tokens/tokens       — Design tokens (colors, spacing, typography, states)
                              JSON → CSS/SCSS/JS/iOS/Android via Style Dictionary
```

Each layer is independently consumable. Tokens without CSS, CSS without React, or the full stack.

---

## Repository Structure

```
fidget-tokens/
├── core/
│   ├── tokens/        @fidget-tokens/tokens — token pipeline (Style Dictionary)
│   ├── css/           @fidget-tokens/css — CSS foundation layer
│   ├── components/    @fidget-tokens/components — React component library
│   └── bin/           CLI for Figma sync operations
├── packages/
│   ├── types/         @fidget-tokens/types — shared TypeScript types
│   ├── models/        @fidget-tokens/models — Figma API models & builders
│   ├── jobs/          @fidget-tokens/jobs — Style Dictionary build & Figma sync jobs
│   ├── utils/         @fidget-tokens/utils — shared utilities
│   ├── postcss-utils/ @fidget-tokens/postcss-utils — reusable PostCSS runner
│   └── config/        @fidget-tokens/configs — shared tsconfig & tooling configs
└── libs/              Git submodules (vendor references)
    ├── fidget/        Fidget design system library
    └── kite-tokens/   Kite token set
```

---

## Token Architecture

Tokens are defined as JSON in `core/tokens/src/tokens/FIDGET/`. Style Dictionary processes them into:

- `dist/tokens/variables.css` — CSS custom properties (the primary consumption format)
- `dist/tokens/variables.scss` — SCSS variables
- `dist/tokens/index.esm.js` — ESM JavaScript token values
- `dist/tokens/index.commonjs.cjs` — CJS JavaScript token values
- `dist/tokens/tokens.json` — raw token JSON
- `dist/tokens/fidget-theme-variables.css` — theme-specific CSS variables
- `dist/tokens/android/` — Android platform tokens
- `dist/tokens/ios/` — iOS platform tokens

**Overrides:**
- `dist/overrides/fidget.css` — Fidget-specific CSS overrides
- `dist/overrides/kite-overrides.css` — Kite design system overrides

The `@kite/tokens` and `@kite/vanilla` packages are available as workspace dependencies in `core/tokens`.

---

## Component Architecture

Components live in `core/components/src/{ComponentName}/` with this structure:

```
ComponentName/
├── index.ts              # Barrel export
├── Component.tsx         # Logic layer (React.memo wrapped)
├── View.tsx              # Presentation layer
├── types.ts              # Props interface
└── ComponentName.stories.tsx
```

Note the **Component/View split** — this is different from the Springfield pattern. `Component.tsx` handles logic and state; `View.tsx` handles rendering. Both are exported.

**Available components:** Accordion, Badge, Button, ButtonGroup, Card, CallReasonHeader, Checkbox, Chip, ClickableCard, Container, DateTimePicker, Dialog, Divider, DropdownMenu, Input, NotificationBadge, Stack, ThemeProvider

**ThemeProvider** is the root wrapper. It provides theme context via `ThemeContext`, exposes `useTheme()` hook, and `makeStyles()` utility for CSS-in-JS style generation.

**Styling:** `clsx` for conditional class names (not `classnames`). CSS classes reference `@fidget-tokens/css` variables. No inline styles.

**Pipeline utility:** `core/components/src/utils/pipeline.ts` — same HOC composition pattern as Springfield's `core/web`.

---

## CSS Foundation

`core/css/` provides the CSS foundation layer. It consumes token CSS variables and provides:
- Reset styles
- Base typography
- Layout utilities
- Form element styles
- Component-level CSS classes

CSS variables follow the pattern `--fidget-{category}-{name}` (e.g., `--fidget-color-primary`, `--fidget-spacing-md`).

---

## Figma Integration

`core/bin/` contains the CLI for Figma sync operations. `packages/models/` contains Figma API models and builders. `packages/jobs/` contains the Style Dictionary build pipeline and Figma sync jobs.

The sync flow: Figma → JSON token files → Style Dictionary → CSS/SCSS/JS/platform outputs.

---

## Build System

- **Style Dictionary** for token transformation
- **esbuild** for component bundling (`core/components/esbuild.config.mjs`)
- **PostCSS** with autoprefixer and cssnano for CSS processing
- **Vitest** for testing (`core/tokens/src/__tests__/`)
- **Storybook** (Vite-based) for component development
- **Changesets** for versioning and changelog management
- **`@bundt/dxdocs`** for documentation site generation

---

## Dependency Graph

```
@fidget-tokens/components
  └── peerDeps: react, react-dom
  └── bundles: clsx (inline)
  └── CSS classes reference: @fidget-tokens/css variables

@fidget-tokens/css
  └── CSS var() references: @fidget-tokens/tokens custom properties
  └── No JS dependencies

@fidget-tokens/tokens
  └── devDeps: @fidget-tokens/jobs (Style Dictionary build)
  └── devDeps: @fidget-tokens/configs (shared tsconfig)

@fidget-tokens/jobs
  └── @fidget-tokens/models → @fidget-tokens/types
```

---

## Key Constraints

- **Do not modify `libs/fidget` or `libs/kite-tokens`** — these are git submodules and vendor references
- **Token changes require a Style Dictionary rebuild** — run `turbo run build --filter=@fidget-tokens/tokens`
- **Component CSS uses token variables** — never hardcode color/spacing values; always reference `--fidget-*` variables
- **Component/View split is intentional** — maintain it when adding new components
- **Versioning is independent per package** — use `@changesets/cli` for version bumps
- **pnpm workspace** — use `pnpm` not `bun` for this repo (unlike Springfield)
