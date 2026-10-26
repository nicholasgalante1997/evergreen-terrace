---
name: design-system
description: Component library conventions — BEM CSS, design tokens, Container/View split, Storybook CSF3, and Bun build pipeline
tags: [react, css, design-system, storybook, bun, component-library]
---

# Design System Conventions

## Priority

**Critical**

## Instructions

**ALWAYS** use Container/View component separation: `Component.tsx` (data + hooks) and `View.tsx` (pure presentational, no hooks) (ID: DS-001)

**NEVER** import CSS files in `.tsx` component files — exception is `.stories.tsx` files only (ID: DS-002)

**ALWAYS** use BEM naming with a project-specific prefix: `.prefix-block__element--modifier` (ID: DS-003)

**NEVER** hardcode colors, spacing, or typography values in CSS — always reference design token custom properties via `var(--token-name)` (ID: DS-004)

**ALWAYS** use `clsx` for conditional class assembly — never string concatenation or template literals for classnames (ID: DS-005)

**NEVER** use CSS-in-JS libraries (styled-components, emotion, MUI `sx` prop) — vanilla CSS only (ID: DS-006)

**ALWAYS** include `tags: ['autodocs']` on every Storybook component meta (ID: DS-007)

**ALWAYS** use CSF3 format for stories: `Meta<typeof Component>` + `StoryObj<typeof Component>` + named exports (ID: DS-008)

**ALWAYS** build JS and CSS independently with separate `bundle()` and `bundleCSS()` functions (ID: DS-009)

**ALWAYS** add a barrel `index.ts` in every component directory (ID: DS-010)

**NEVER** reference the token package's JS exports in component files — only `var(--token-name)` in CSS (ID: DS-011)

**ALWAYS** export both JS and CSS from `package.json` exports field: `"."` for JS and `"./styles"` for CSS (ID: DS-012)

### Component Architecture

File structure for every component:

```
src/components/Button/
├── Button.tsx          Container — data, hooks, event handlers
├── View.tsx            Presentational — no hooks, no state
├── types.ts            Shared interfaces and prop types
├── index.ts            Barrel export
├── Button.css          BEM styles co-located with component
└── Button.stories.tsx  Storybook stories (imports CSS here)
```

Container component:

```tsx
// Button.tsx
import React from "react";
import type { ButtonProps } from "./types";
import { ButtonView } from "./View";

function Button({ onClick, disabled = false, variant = "primary", children }: ButtonProps) {
  const handleClick = React.useCallback(() => {
    if (!disabled) onClick?.();
  }, [disabled, onClick]);

  return (
    <ButtonView
      onClick={handleClick}
      disabled={disabled}
      variant={variant}
    >
      {children}
    </ButtonView>
  );
}

export const Button = React.memo(Button);
```

View component:

```tsx
// View.tsx
import React from "react";
import clsx from "clsx";
import type { ButtonViewProps } from "./types";

function ButtonView({ onClick, disabled, variant, children }: ButtonViewProps) {
  return (
    <button
      className={clsx(
        "btn",
        `btn--${variant}`,
        disabled && "btn--disabled",
      )}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
    >
      {children}
    </button>
  );
}

export const ButtonView = React.memo(ButtonView);
```

Barrel export:

```typescript
// index.ts
export { Button } from "./Button";
export { ButtonView } from "./View";
export type { ButtonProps } from "./types";
```

### BEM CSS with Design Tokens

```css
/* Button.css */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--border-radius-sm);
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background-color var(--transition-fast), opacity var(--transition-fast);
}

.btn--primary {
  background-color: var(--color-primary);
  color: var(--color-on-primary);
}

.btn--primary:hover:not(.btn--disabled) {
  background-color: var(--color-primary-hover);
}

.btn--secondary {
  background-color: transparent;
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.btn--disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.btn__icon {
  margin-right: var(--spacing-xs);
  width: 1em;
  height: 1em;
}
```

### `clsx` Conditional Classnames

```tsx
import clsx from "clsx";

// Multiple conditions
<div
  className={clsx(
    "card",
    isHighlighted && "card--highlighted",
    isLoading && "card--loading",
    size === "large" && "card--large",
    size === "small" && "card--small",
  )}
/>

// Variant mapping
const variantClass: Record<Variant, string> = {
  primary: "btn--primary",
  secondary: "btn--secondary",
  ghost: "btn--ghost",
};

<button className={clsx("btn", variantClass[variant], disabled && "btn--disabled")} />
```

### Storybook CSF3 Stories

```tsx
// Button.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";
import "./Button.css"; // Import CSS in stories only

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "ghost"],
    },
    disabled: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    variant: "primary",
    children: "Click me",
  },
};

export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Click me",
  },
};

export const Disabled: Story = {
  args: {
    variant: "primary",
    disabled: true,
    children: "Disabled",
  },
};
```

### CSS Bundle with Bun.Glob

```typescript
// build/css.ts
import { join } from "node:path";

export async function bundleCSS(srcDir: string, outFile: string): Promise<void> {
  const glob = new Bun.Glob("**/*.css");
  const files = await Array.fromAsync(glob.scan({ cwd: srcDir, absolute: true }));

  // Sort for deterministic output
  files.sort();

  const parts = await Promise.all(files.map((f) => Bun.file(f).text()));
  const combined = parts.join("\n");

  await Bun.write(outFile, combined);
  console.log(`[css] bundled ${files.length} files → ${outFile}`);
}

// build/index.ts
import { bundleCSS } from "./css";
import { createBaseConfig } from "./base";

// Build JS
const result = await Bun.build({
  ...createBaseConfig(),
  entrypoints: ["src/index.ts"],
  outdir: "dist",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// Build CSS separately
await bundleCSS("src", "dist/index.css");

// Verify types
const tsc = Bun.spawnSync(["tsc", "--noEmit"], { stdout: "inherit", stderr: "inherit" });
if (tsc.exitCode !== 0) process.exit(tsc.exitCode ?? 1);
```

### Package Exports

```json
{
  "name": "@project/ui",
  "version": "0.1.0",
  "type": "module",
  "files": ["dist"],
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./styles": "./dist/index.css",
    "./package.json": "./package.json"
  },
  "scripts": {
    "build": "bun build/index.ts",
    "typecheck": "tsc --noEmit"
  }
}
```

Consuming the package:

```typescript
// Import components
import { Button } from "@project/ui";

// Import styles (in Storybook preview, not in components)
import "@project/ui/styles";
```

## Common Mistakes

- **Importing CSS in `.tsx` component files**: CSS imports in component files cause style duplication and can break SSR. Import component CSS in `.stories.tsx` files and in the app's entry point via the `./styles` export.
- **Hardcoding `#3b82f6` or `16px` in CSS**: These values drift from the design token package and break theme switching. Always use `var(--color-primary)`, `var(--spacing-md)`, etc.
- **Using template literals for classnames**: `className={\`btn ${isActive ? "btn--active" : ""}\`}` — this is fragile, harder to read, and doesn't handle falsy values cleanly. Use `clsx`.
- **Putting data-fetching hooks in the View component**: View components must be pure and stateless. Side effects, queries, and event handler logic belong in the Container component. The test for a View: can you render it with just props and no mocks?
- **Missing the `./styles` export in `package.json`**: Consumers can't import your CSS without it. The exports field is required for correct module resolution.
- **Building JS and CSS together**: Bun.build does not emit CSS as a named output. The CSS bundle must be built separately using `Bun.Glob` to collect source files and `Bun.write` to concatenate them.
- **Not covering all variants and states in Storybook**: Stories are the visual test suite. Missing the `disabled` story or the `error` state means regressions go unnoticed. Cover every modifier defined in the BEM CSS.
