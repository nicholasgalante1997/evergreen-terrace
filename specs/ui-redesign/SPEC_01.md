# SPEC_01 — Design Token System

## Context

The current `index.css` uses a flat single-layer token set (`--bg-base`, `--accent`, etc.) directly tied to GitHub's color palette and applied globally with monospace as the base font. This spec replaces that with a **three-layer token architecture**: primitives → semantic → component. Both theme modes are defined in the same file. No component file ever references a raw hex value after this spec.

## Prerequisites

None. This is the root spec.

## Requirements

### 1. Token Architecture

Three layers, defined in `index.css`:

```
Primitive tokens   → raw values (never used directly in components)
Semantic tokens    → named by purpose, reference primitives
Component tokens   → per-component overrides (optional, additive)
```

All theme switching is accomplished by redefining semantic tokens only. Primitives do not change between themes — they are the palette universe.

### 2. Primitive Token Set

```css
/* index.css — Primitives (palette universe, theme-neutral) */
:root {
  /* Neutrals */
  --gray-0:   #ffffff;
  --gray-50:  #f9fafb;
  --gray-100: #f3f4f6;
  --gray-200: #e5e7eb;
  --gray-300: #d1d5db;
  --gray-400: #9ca3af;
  --gray-500: #6b7280;
  --gray-600: #4b5563;
  --gray-700: #374151;
  --gray-800: #1f2937;
  --gray-900: #111827;
  --gray-950: #030712;

  /* Blue (accent) */
  --blue-400: #60a5fa;
  --blue-500: #3b82f6;
  --blue-600: #2563eb;
  --blue-900: #1e3a5f;
  --blue-950: #0f1f3d;

  /* Semantic status */
  --red-400:    #f87171;
  --red-500:    #ef4444;
  --amber-400:  #fbbf24;
  --amber-500:  #f59e0b;
  --green-400:  #4ade80;
  --green-500:  #22c55e;
}
```

### 3. Semantic Token Set — Dark Mode (default)

```css
[data-theme="dark"] {
  /* Backgrounds */
  --bg-base:      var(--gray-950);
  --bg-surface:   var(--gray-900);
  --bg-raised:    var(--gray-800);
  --bg-sunken:    var(--gray-950);
  --bg-input:     var(--gray-800);
  --bg-overlay:   rgba(0, 0, 0, 0.6);

  /* Borders */
  --border:         var(--gray-700);
  --border-subtle:  var(--gray-800);
  --border-strong:  var(--gray-600);
  --border-focus:   var(--blue-500);

  /* Text */
  --text-primary:   var(--gray-50);
  --text-secondary: var(--gray-400);
  --text-muted:     var(--gray-600);
  --text-disabled:  var(--gray-700);
  --text-inverse:   var(--gray-950);

  /* Accent (interactive) */
  --accent:         var(--blue-400);
  --accent-hover:   var(--blue-500);
  --accent-dim:     var(--blue-950);
  --accent-subtle:  rgba(59, 130, 246, 0.08);

  /* Status (priority) */
  --status-p0:          var(--red-400);
  --status-p0-subtle:   rgba(248, 113, 113, 0.10);
  --status-p1:          var(--amber-400);
  --status-p1-subtle:   rgba(251, 191, 36, 0.10);
  --status-p2:          var(--green-400);
  --status-p2-subtle:   rgba(74, 222, 128, 0.10);
  --status-p3:          var(--gray-500);
  --status-p3-subtle:   rgba(107, 114, 128, 0.10);

  /* Surfaces (semantic shorthand) */
  --surface-card:        var(--bg-surface);
  --surface-card-border: var(--border);
  --surface-hover:       var(--bg-raised);
  --surface-selected:    var(--blue-950);
  --surface-selected-border: var(--blue-500);
}
```

### 4. Semantic Token Set — Light Mode

```css
[data-theme="light"] {
  /* Backgrounds */
  --bg-base:      var(--gray-50);
  --bg-surface:   var(--gray-0);
  --bg-raised:    var(--gray-100);
  --bg-sunken:    var(--gray-100);
  --bg-input:     var(--gray-0);
  --bg-overlay:   rgba(0, 0, 0, 0.4);

  /* Borders */
  --border:         var(--gray-200);
  --border-subtle:  var(--gray-100);
  --border-strong:  var(--gray-300);
  --border-focus:   var(--blue-500);

  /* Text */
  --text-primary:   var(--gray-900);
  --text-secondary: var(--gray-600);
  --text-muted:     var(--gray-400);
  --text-disabled:  var(--gray-300);
  --text-inverse:   var(--gray-0);

  /* Accent */
  --accent:         var(--blue-500);
  --accent-hover:   var(--blue-600);
  --accent-dim:     rgba(59, 130, 246, 0.08);
  --accent-subtle:  rgba(59, 130, 246, 0.06);

  /* Status */
  --status-p0:          var(--red-500);
  --status-p0-subtle:   rgba(239, 68, 68, 0.08);
  --status-p1:          var(--amber-500);
  --status-p1-subtle:   rgba(245, 158, 11, 0.08);
  --status-p2:          var(--green-500);
  --status-p2-subtle:   rgba(34, 197, 94, 0.08);
  --status-p3:          var(--gray-400);
  --status-p3-subtle:   rgba(156, 163, 175, 0.08);

  /* Surfaces */
  --surface-card:        var(--bg-surface);
  --surface-card-border: var(--border);
  --surface-hover:       var(--gray-50);
  --surface-selected:    rgba(59, 130, 246, 0.06);
  --surface-selected-border: var(--blue-500);
}
```

### 5. Typography Scale

```css
:root {
  /* Font families */
  --font-sans: "Inter", "Geist", ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-mono: "Geist Mono", "JetBrains Mono", "Fira Code", ui-monospace, monospace;

  /* Font size scale */
  --text-xs:   11px;
  --text-sm:   12px;
  --text-base: 13px;
  --text-md:   14px;
  --text-lg:   16px;
  --text-xl:   20px;
  --text-2xl:  24px;
  --text-3xl:  30px;

  /* Line heights */
  --leading-tight:  1.25;
  --leading-snug:   1.375;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;

  /* Font weights */
  --weight-normal:   400;
  --weight-medium:   500;
  --weight-semibold: 600;
  --weight-bold:     700;
}
```

Font loading in `index.html` (or Vite's `vite.config.ts` via `@fontsource/inter` package):

```typescript
// Option A: npm package (preferred for Vite)
// bun add @fontsource/inter @fontsource/geist-mono
// In main.tsx:
import "@fontsource/inter/400.css"
import "@fontsource/inter/500.css"
import "@fontsource/inter/600.css"
import "@fontsource/inter/700.css"
import "@fontsource/geist-mono/400.css"
```

### 6. Spacing Scale

```css
:root {
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-8:  32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```

### 7. Border Radius Scale

```css
:root {
  --radius-sm:   4px;
  --radius-md:   6px;
  --radius-lg:   8px;
  --radius-xl:   12px;
  --radius-full: 9999px;
}
```

### 8. Shadow Scale (light mode primarily)

```css
:root {
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05);
}
```

### 9. Backward Compatibility Shim (temporary, remove after SPEC_03)

Keep old token names as aliases during the transition so no components break immediately:

```css
:root {
  /* COMPAT — remove after SPEC_03 lands */
  --bg-base:    var(--bg-base);     /* already same name */
  --p0:         var(--status-p0);
  --p1:         var(--status-p1);
  --p2:         var(--status-p2);
  --p3:         var(--status-p3);
  --accent-dim: var(--accent-dim);  /* already same name */
  --tag-bg:     var(--bg-input);
}
```

## File Structure

```
core/web/
├── index.html              ← add theme-detection inline script (SPEC_02)
├── src/
│   └── index.css           ← MODIFIED: full token replacement
└── package.json            ← add @fontsource/inter, @fontsource/geist-mono
```

## Acceptance Criteria

- [ ] `index.css` defines `[data-theme="dark"]` and `[data-theme="light"]` blocks with all semantic tokens
- [ ] Primitive palette defined in `:root` only — no hex values in `[data-theme]` blocks directly
- [ ] `--font-sans` and `--font-mono` variables defined and loaded
- [ ] Typography, spacing, radius, and shadow scales defined in `:root`
- [ ] WCAG AA contrast verified for all text/background combinations in both themes: primary (≥7:1), secondary (≥4.5:1), muted (≥3:1)
- [ ] `@fontsource/inter` and `@fontsource/geist-mono` installed and imported
- [ ] Backward-compat shim in place: no existing stories break after this spec lands alone
- [ ] `bunx tsc --noEmit` passes

## Verification

```bash
# Verify no hex colors in component files (should return nothing after SPEC_03)
grep -rn '#[0-9a-fA-F]\{3,6\}' core/web/src/components/ --include="*.tsx"

# Verify fontsource packages installed
ls node_modules/@fontsource/inter

# Verify typecheck
bunx tsc --noEmit -p core/web/tsconfig.json

# Verify storybook still starts
cd core/web && bun run storybook --smoke-test
```
