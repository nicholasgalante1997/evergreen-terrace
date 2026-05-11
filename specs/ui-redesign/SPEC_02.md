# SPEC_02 — Theme Infrastructure

## Context

Tokens exist (SPEC_01) but nothing switches them yet. This spec wires up the runtime machinery: a `useTheme` hook, a `ThemeToggle` component, `[data-theme]` attribute management, OS preference detection, and no-FOUC protection. After this spec, the toggle works end-to-end and the theme persists across reloads.

## Prerequisites

- SPEC_01 complete: `[data-theme="dark"]` and `[data-theme="light"]` blocks exist in `index.css`

## Requirements

### 1. No-FOUC Inline Script

Add to `index.html` **before any other script** — runs synchronously, sets `data-theme` on `<html>` before React loads, preventing flash of wrong theme:

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>evergreen-terrace</title>
  <script>
    // Inline — must run synchronously before paint
    (function () {
      const stored = localStorage.getItem("et-theme")
      const preferred = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
      document.documentElement.dataset.theme = stored ?? preferred
    })()
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

### 2. `useTheme` Hook

```typescript
// src/hooks/useTheme.ts
import { useState, useEffect, useCallback } from "react"

export type Theme = "dark" | "light"

const STORAGE_KEY = "et-theme"

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === "dark" || stored === "light") return stored
  return getSystemTheme()
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset["theme"] = theme
}

export interface UseThemeResult {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

export function useTheme(): UseThemeResult {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  // Sync with OS preference changes while no stored preference exists
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)")
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setThemeState(e.matches ? "light" : "dark")
      }
    }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  const toggle = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"))
  }, [])

  const setTheme = useCallback((t: Theme) => setThemeState(t), [])

  return { theme, toggle, setTheme }
}
```

### 3. `ThemeToggle` Component

```
components/ThemeToggle/
  index.ts
  types.ts
  View.tsx
  Component.tsx
```

```typescript
// types.ts
import type { Theme } from "@/hooks/useTheme"

export interface ThemeToggleViewProps {
  theme: Theme
  onToggle: () => void
}
```

```tsx
// View.tsx
import type { ThemeToggleViewProps } from "./types"

export function ThemeToggleView({ theme, onToggle }: ThemeToggleViewProps) {
  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? (
        // Sun icon — switch to light
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        // Moon icon — switch to dark
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}
```

```tsx
// Component.tsx
import { memo } from "react"
import { pipeline } from "@/utils/pipeline"
import { useTheme } from "@/hooks/useTheme"
import { ThemeToggleView } from "./View"

function ThemeToggleComponent() {
  const { theme, toggle } = useTheme()
  return <ThemeToggleView theme={theme} onToggle={toggle} />
}

export const ThemeToggle = pipeline(memo)(ThemeToggleComponent)
```

### 4. Wire ThemeToggle into Header

Update `Header/types.ts` — no new props needed; `ThemeToggle` is self-contained (reads its own hook). Add it to `Header/View.tsx`:

```tsx
// Header/View.tsx (updated section only)
import { ThemeToggle } from "@/components/ThemeToggle"

// Inside HeaderView JSX, after <nav>:
<div className="header__actions">
  <ThemeToggle />
</div>
```

Update `Header` CSS:

```css
.header {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
}

.header__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}

.theme-toggle:hover {
  background: var(--bg-raised);
  color: var(--text-primary);
  border-color: var(--border-strong);
}
```

### 5. Storybook Theme Decorator

Add a global decorator so every story renders in both themes side-by-side (or via Storybook toolbar toggle):

```typescript
// .storybook/preview.ts
import type { Preview, Decorator } from "@storybook/react"
import "../src/index.css"

const withTheme: Decorator = (Story, context) => {
  const theme = context.globals["theme"] ?? "dark"
  document.documentElement.dataset["theme"] = theme
  return <Story />
}

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      name: "Theme",
      description: "Global theme",
      defaultValue: "dark",
      toolbar: {
        icon: "circlehollow",
        items: [
          { value: "dark",  title: "Dark" },
          { value: "light", title: "Light" },
        ],
        showName: true,
      },
    },
  },
  parameters: {
    backgrounds: { disable: true }, // use theme token for background instead
  },
}

export default preview
```

## File Structure

```
core/web/
├── index.html                        ← MODIFIED: add no-FOUC inline script
├── src/
│   ├── hooks/
│   │   └── useTheme.ts               ← NEW
│   ├── components/
│   │   ├── ThemeToggle/              ← NEW
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── View.tsx
│   │   │   └── Component.tsx
│   │   └── Header/
│   │       └── View.tsx              ← MODIFIED: add ThemeToggle
│   └── index.css                     ← MODIFIED: .theme-toggle styles
└── .storybook/
    └── preview.ts                    ← MODIFIED: theme decorator + globalTypes
```

## Acceptance Criteria

- [ ] Opening the app with no `localStorage["et-theme"]` matches the OS `prefers-color-scheme` setting
- [ ] Clicking ThemeToggle switches the `data-theme` attribute on `<html>` within one render
- [ ] Hard-reloading the page after toggling preserves the selected theme (no flash)
- [ ] Toggling rapidly 10 times lands on the correct final state
- [ ] Storybook toolbar shows "Theme" selector with Dark / Light options; selecting one updates all stories
- [ ] `ThemeToggle` renders correctly in both themes (no invisible icon)
- [ ] `bunx tsc --noEmit` passes

## Verification

```bash
# Typecheck
bunx tsc --noEmit -p core/web/tsconfig.json

# Confirm no-FOUC script is in index.html before any script tag
grep -A5 "et-theme" core/web/index.html

# Confirm localStorage key is set after toggle (manual browser check)
# Open DevTools → Application → Local Storage → localhost:2728 → et-theme
```
