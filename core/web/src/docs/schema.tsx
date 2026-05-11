export default function SchemaGuide() {
  return (
    <article className="guide">
      <h1 className="guide__title">Queue Item Schema</h1>
      <p className="guide__lead">
        TOML structure, field descriptions, and complete examples for all ticket types.
      </p>

      <section className="guide__section">
        <h2 className="guide__h2">Schema overview</h2>
        <pre className="guide__pre">{`[item]
id = ""           # UUID
title = ""
project = ""      # from context/projects/
type = ""         # feature | bug | research | design | pm | ops
priority = ""     # p0 | p1 | p2 | p3
created = ""      # ISO datetime
source = ""       # manual | sentinel | jira | gitlab

[delegation]
agent = ""
delegated_at = ""

[context]
description = ""
acceptance = ""
links = []`}</pre>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Field reference</h2>
        <h3 className="guide__h3">[item] section</h3>
        <table className="guide__table">
          <thead>
            <tr><th>Field</th><th>Type</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td><code className="guide__code">id</code></td><td>string (UUID)</td><td>Unique identifier — generated automatically by the PM agent</td></tr>
            <tr><td><code className="guide__code">title</code></td><td>string</td><td>Short, action-oriented title (e.g., "Implement Phase 2 analysis engine")</td></tr>
            <tr><td><code className="guide__code">project</code></td><td>string</td><td>Project name matching a file in <code className="guide__code">context/projects/</code></td></tr>
            <tr><td><code className="guide__code">type</code></td><td>enum</td><td>feature | bug | research | design | pm | ops</td></tr>
            <tr><td><code className="guide__code">priority</code></td><td>enum</td><td>p0 | p1 | p2 | p3</td></tr>
            <tr><td><code className="guide__code">created</code></td><td>ISO datetime</td><td>Creation timestamp</td></tr>
            <tr><td><code className="guide__code">source</code></td><td>enum</td><td>manual | sentinel | jira | gitlab</td></tr>
          </tbody>
        </table>
        <h3 className="guide__h3">[delegation] section</h3>
        <table className="guide__table">
          <thead>
            <tr><th>Field</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td><code className="guide__code">agent</code></td><td>Agent role to dispatch to (e.g., "eng-mid")</td></tr>
            <tr><td><code className="guide__code">delegated_at</code></td><td>Timestamp when dispatched — set by the queue server</td></tr>
          </tbody>
        </table>
        <h3 className="guide__h3">[context] section</h3>
        <table className="guide__table">
          <thead>
            <tr><th>Field</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td><code className="guide__code">description</code></td><td>Full context: background, current state, why this work exists. This is the agent's primary brief.</td></tr>
            <tr><td><code className="guide__code">acceptance</code></td><td>What "done" looks like. Write as a checklist. The PM agent formats these as markdown checkboxes.</td></tr>
            <tr><td><code className="guide__code">links</code></td><td>Array of file paths or URLs for context the agent should read first.</td></tr>
          </tbody>
        </table>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Example: feature ticket</h2>
        <pre className="guide__pre">{`[item]
id = "a4f1c8d2-9b3e-4a1f-8c7d-2e5f0b9a3c1d"
title = "Implement velocity chart pagination"
project = "evergreen-terrace"
type = "feature"
priority = "p2"
created = "2026-05-10T14:30:00Z"
source = "manual"

[delegation]
agent = "eng-mid"
delegated_at = ""

[context]
description = """
The VelocityChart component currently shows all-time data.
For projects with long history, this makes the chart unreadable.
Add pagination or a date-range selector to limit the visible window.
The current component is at core/web/src/components/VelocityChart/.
"""
acceptance = """
- [ ] VelocityChart accepts optional dateRange prop
- [ ] Date range selector renders in the chart toolbar
- [ ] Default view shows last 30 days
- [ ] bunx tsc --noEmit passes
"""
links = [
  "core/web/src/components/VelocityChart/View.tsx",
  "core/web/src/components/VelocityChart/types.ts"
]`}</pre>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Example: pm ticket</h2>
        <pre className="guide__pre">{`[item]
id = "b7d2e9f4-1a3c-4b8e-9f2d-5c7a0b3e6d1f"
title = "Create tickets for Agartha OS kernel memory manager"
project = "agartha-os"
type = "pm"
priority = "p1"
created = "2026-05-10T09:00:00Z"
source = "sentinel"

[delegation]
agent = "pm"
delegated_at = ""

[context]
description = """
The sentinel flagged Agartha OS as at-risk (score: 61).
The next phase is memory management (physical + virtual allocator).
The PM agent should read the existing kernel code and specs,
then produce 3-5 well-specified tickets for the memory manager work.
"""
acceptance = """
- [ ] 3–5 tickets written to queue/inbox/
- [ ] Each ticket has description, acceptance criteria, and links
- [ ] Tickets are ordered by dependency (allocator before virtual memory)
"""
links = [
  "specs/agartha-memory.md",
  "context/projects/agartha-os.toml"
]`}</pre>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Example: research ticket</h2>
        <pre className="guide__pre">{`[item]
id = "c9e1f3a5-2b4d-4c7f-a1e3-6d8b0c2e5f7a"
title = "Research SQLite WAL mode performance for conductor state"
project = "evergreen-terrace"
type = "research"
priority = "p3"
created = "2026-05-10T11:00:00Z"
source = "manual"

[delegation]
agent = "eng-senior"
delegated_at = ""

[context]
description = """
The conductor currently uses individual TOML files for bead state.
At scale (100+ beads), filesystem I/O may become a bottleneck.
Research whether switching to SQLite WAL mode would improve performance
and what migration complexity looks like.
"""
acceptance = """
- [ ] Benchmark TOML vs SQLite for 100, 500, 1000 bead reads
- [ ] Document WAL mode configuration for Bun's SQLite driver
- [ ] Estimate migration effort (schema design + query updates)
- [ ] Write findings to context/research/conductor-sqlite-wal.md
"""
links = [
  "core/conductor/src/index.ts",
  "context/conductor.db"
]`}</pre>
      </section>
    </article>
  )
}
