# Design Decisions

## Decision 1: CSS Custom Property Theming vs. CSS-in-JS vs. Tailwind

**Question**: What mechanism manages the light/dark theme switch?

**Options**:

**A — CSS Custom Properties with `[data-theme]` attribute** ⭐⭐⭐⭐⭐
```css
[data-theme="dark"]  { --bg-base: #030712; }
[data-theme="light"] { --bg-base: #f9fafb; }
```
Pros: zero runtime cost, single source of truth in one file, works with SSR, no JS required for theme application once attribute is set, straightforward debugging in DevTools.
Cons: no TypeScript-level enforcement of token names.

**B — Tailwind CSS with `dark:` variants** ⭐⭐⭐
```tsx
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
```
Pros: battle-tested, extensive tooling, utility classes eliminate the need to name everything.
Cons: contradicts the no-CSS-in-JS / no-framework rule in the project CLAUDE.md. Adds a dependency. Class names become long and noisy. Large refactor from current BEM approach.

**C — Runtime JS object themes** ⭐⭐
```tsx
const theme = { bg: isDark ? "#030712" : "#f9fafb" }
<div style={{ background: theme.bg }}>
```
Pros: TypeScript-enforced, co-located with components.
Cons: inline styles, breaks CSS custom property cascade, no browser DevTools inspection, large refactor required.

**Decision**: **Option A**. Matches the existing architecture (already uses CSS custom properties). Zero-cost at runtime. No new dependencies. The CLAUDE.md explicitly bans CSS-in-JS. The `[data-theme]` attribute switching via `useTheme` hook is clean and testable.

**Implementation rules**:
- Primitives (hex values) only appear in `:root` once
- Semantic tokens are redefined in `[data-theme="dark"]` and `[data-theme="light"]`
- Component CSS never references a primitive token directly — always semantic
- `document.documentElement.dataset.theme` is the single mutation point

---

## Decision 2: Font Loading Strategy

**Question**: How should Inter and Geist Mono be loaded?

**Options**:

**A — `@fontsource` npm packages** ⭐⭐⭐⭐⭐
```bash
bun add @fontsource/inter @fontsource/geist-mono
```
```typescript
// main.tsx
import "@fontsource/inter/400.css"
import "@fontsource/inter/500.css"
import "@fontsource/inter/600.css"
import "@fontsource/inter/700.css"
import "@fontsource/geist-mono/400.css"
```
Pros: self-hosted (no external requests), version-locked, tree-shakeable by weight, works with Vite's asset pipeline out of the box.
Cons: slightly larger bundle than CDN with long-lived cache headers.

**B — Google Fonts CDN** ⭐⭐⭐
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700" rel="stylesheet">
```
Pros: CDN-cached across sites, simple.
Cons: external dependency, privacy concern (user IP to Google), doesn't work in offline dev environments (DGX without internet access), latency on first load.

**C — System font stack only** ⭐⭐
```css
--font-sans: ui-sans-serif, system-ui, -apple-system, sans-serif;
```
Pros: zero loading cost, always available.
Cons: no cross-platform consistency — will look different on Linux (DGX) vs macOS (laptop). The redesign goal specifically calls for a distinctive look.

**Decision**: **Option A**. The project runs on a DGX which may not have reliable external internet access during development. Self-hosted via `@fontsource` guarantees fonts are available offline and removes Google as a dependency. Vite handles the CSS import naturally.

**Implementation rules**:
- Import only the weights actually used (400, 500, 600, 700 for Inter; 400 for Geist Mono)
- Define `--font-sans` and `--font-mono` in `:root` referencing the loaded families
- Add `font-display: swap` to avoid invisible text during font load (handled by `@fontsource` by default)

---

## Decision 3: Docs Content Format — TSX vs MDX vs Plain Markdown

**Question**: What format should guide content be authored in?

**Options**:

**A — Plain TSX React components** ⭐⭐⭐⭐⭐
```tsx
export default function ModelBGuide() {
  return (
    <article className="guide">
      <h1 className="guide__title">Model B — Conductor</h1>
      <p>Dispatch a ticket...</p>
      <pre className="guide__pre">bun run start</pre>
    </article>
  )
}
```
Pros: no extra toolchain, full TypeScript, can import live components (e.g., embed a real `SidebarRow` example), tree-shakeable, already supported by the existing Vite config.
Cons: more verbose than Markdown; prose updates require TSX knowledge.

**B — MDX** ⭐⭐⭐
```mdx
# Model B — Conductor

Dispatch a ticket...

```bash
bun run start
```
```
Pros: Markdown authoring experience, can embed React components.
Cons: requires `@mdx-js/rollup` Vite plugin (new dependency), adds build complexity, slightly slower HMR, requires additional tsconfig settings for MDX types.

**C — Raw Markdown strings parsed at render time** ⭐⭐
```typescript
const content = `# Model B\n\nDispatch a ticket...`
// Parse with marked.js or similar at runtime
```
Pros: pure string authoring.
Cons: runtime dependency for parsing, XSS risk if content is dynamic, no TypeScript in content.

**Decision**: **Option A**. The project's principle is "Vanilla over frameworks" and avoiding unnecessary dependencies. TSX is already the authoring language for everything else. The guide content is relatively static and won't be edited by non-developers. The ability to embed live components (e.g., a real `<SidebarRow>` rendering an example queue item) is a genuine advantage for documentation quality.

**Implementation rules**:
- Each guide is a standalone `.tsx` file with a default export
- Shared prose styling through `.guide` BEM classes (not inline styles)
- Live component embeds are permitted and encouraged where they aid comprehension
- No Markdown parsing at runtime

---

## Decision 4: Docs Navigation — URL-based vs. State-based

**Question**: Should clicking a sidebar link update the URL?

**Options**:

**A — URL-based routing (`/docs/:slug`)** ⭐⭐⭐⭐⭐
```typescript
navigate(`/docs/${slug}`)
```
Pros: browser back/forward works; deep links share the exact section; page reload stays on the right section; bookmarkable.
Cons: one extra router entry; content must be lazy-loaded by slug.

**B — Local state only**
```typescript
const [activeSlug, setActiveSlug] = useState("getting-started")
```
Pros: simpler.
Cons: back button breaks; can't link directly to a section; `/docs/model-b` is not addressable; content resets on reload.

**Decision**: **Option A**. The UX cost of broken back button and non-bookmarkable sections is too high for a reference docs section. Vite's code splitting handles the per-slug lazy loading cleanly. The implementation is straightforward with React Router's `useParams`.

**Implementation rules**:
- Route: `/docs` (index → getting-started) and `/docs/:slug`
- Both routes render the same `DocsPage` component
- `slug` defaults to `"getting-started"` when on the index route
- Content is lazy-loaded via dynamic `import()` per slug
