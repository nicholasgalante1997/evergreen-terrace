# Model A — Assisted Workflow

You + Claude Code, with the queue as a structured briefing system. Nothing runs
automatically. You are the execution layer; the queue and sentinel exist to make
sure you're working on the right thing with a well-specified brief.

---

## The loop

```
Sentinel run
  → surfaces at-risk and misaligned projects
  → PM creates queue items from findings

Queue review (web UI: localhost:2728)
  → inspect items in priority order
  → dispatch the next item to "active" (state change only — no automation)

Claude Code session in the project
  → use the ticket's description + acceptance as your opening context
  → work interactively until acceptance criteria are met

Mark complete in the web UI
  → moves ticket to completed/
  → update context TOML if project state changed
```

---

## Starting a session from a ticket

1. Open the web UI (`mise run start` or `bun run start`)
2. Select the highest-priority inbox item
3. Read the `description` and `acceptance` sections in the detail pane
4. Note the `project` field and the `links` — these are the files and specs to load
5. Click **Dispatch** (sets the item to active; records which agent was intended)
6. Open Claude Code **in the project's repository** — not in evergreen-terrace

```bash
# Example for a deckvault feature ticket:
cd ~/dev/.Project-Johto/Pokemon
claude
```

7. Start the session by giving Claude the ticket context:

```
I'm working on this ticket:

TITLE: [paste title]

DESCRIPTION:
[paste description block]

ACCEPTANCE CRITERIA:
[paste acceptance block]

LINKS / CONTEXT FILES:
[paste links]

Let's start by reading the relevant source files.
```

8. Work through the acceptance criteria interactively
9. When done: return to the web UI, select the active item, click **Mark Complete**

---

## Why this model still makes sense

Even with the conductor built out, Model A is better when:

- **The scope will shift.** Acceptance criteria are a starting point; the right
  implementation often reveals itself during the session. The conductor's `claude -p`
  is a single non-interactive shot — if the approach needs to change mid-way, it
  fails and you restart. In Claude Code you can redirect in real time.

- **Architecture decisions are involved.** A ticket like "implement Phase 2 analysis
  engine" has a clear brief but the right data structure might not be known until you
  see the existing code. That's a conversation, not a one-shot invocation.

- **Multiple files across multiple repos are in scope.** The conductor runs in one
  project directory. Cross-cutting work (e.g., a feature that touches deckvault's
  API and a bundt package simultaneously) belongs in Model A.

- **You want to understand the output.** For anything non-trivial, working through
  it interactively means you understand every decision. The conductor produces
  output you then review cold.

---

## Ticket field reference

When starting a session, these fields map directly to what Claude needs:

| Field | What it provides |
|-------|-----------------|
| `description` | Background, current state, why this work exists |
| `acceptance` | Exit criteria — what done looks like |
| `links` | Context files, specs, related code to load first |
| `delegation.agent` | The intended role — tells you which agent AGENT.md to reference for tone/approach |
| `item.project` | Which repo to `cd` into |

---

## Updating context after a session

If the session materially changes a project's state (phase advances, architecture
changes, new next action), update `context/projects/{project}.toml`:

- `last_touched` → today's date
- `notes.context` → any new architectural facts
- `notes.next_action` → what the next session should start from
- `status.phase` → if the phase changed

The sentinel scores `context_freshness` — stale TOMLs drag scores down and produce
inaccurate reports.
