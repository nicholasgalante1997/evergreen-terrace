# Model B — Conductor Workflow

Dispatching a ticket from the web UI triggers the conductor, which builds a prompt for
review, then invokes `claude -p` non-interactively in the project's working directory.
Output streams to the browser in real-time with structured event types. Code-producing
tickets require your explicit approval before they are marked complete.

---

## Architecture

```
Web UI dispatch
  → POST /queue/delegate { id, agent }
  → queue-server moves TOML: inbox/ → active/
  → queue-server fires POST /conductor/dispatch { item: QueueItem }

Conductor receives item
  → resolves project repo from context/projects/{project}.toml [repo field]
  → creates goal + single bead in context/beads/{goal_id}/
  → bead.status = "prompt_pending"   ← agent does NOT run yet
  → bead.worker.cwd = project repo path  ← CRITICAL CONSTRAINT

Prompt preparation (background, < 2s)
  → loads agents/{role}/AGENT.md + skills + steering docs
  → appends conductor-mode instruction
  → injects project context TOML
  → assembles user-facing prompt (title + description + acceptance)
  → writes to disk:
      context/beads/{goal_id}/sysprompt-{bead_id}.md  (system prompt)
      context/beads/{goal_id}/prompt-{bead_id}.md     (user prompt, editable)

Browser prompt review pane
  → polls GET /conductor/bead/:id/prompt until both files exist
  → shows: system prompt (read-only, collapsible) + user prompt (editable textarea)
  → you review, optionally edit, click Dispatch

Dispatch
  → POST /conductor/bead/:id/prompt { prompt?: string }
  → if prompt body provided: overwrites prompt-{bead_id}.md with edited version
  → bead.status → "pending"
  → dispatchPending() picks it up

Bead execution (polecat)
  → reads prompt files from disk (your edited version if you changed it)
  → Bun.spawn([
       "claude", "-p", <prompt>,
       "--system-prompt", <system-prompt>,
       "--model", <agent model>,
       "--allowedTools", <tool list>,
       "--output-format", "stream-json",   ← structured NDJSON output
     ], { cwd: project_repo })
  → parses stdout NDJSON line by line:
      {"type":"system","subtype":"init"} → status event "Session ready · tools: ..."
      {"type":"assistant","message":{"content":[{"type":"text"}]}} → output event
      {"type":"assistant","message":{"content":[{"type":"tool_use"}]}} → tool_use event
      {"type":"result","usage":{...},"total_cost_usd":N} → usage event
      non-JSON line → output event (plain text fallback)
  → writes BeadEvents to context/beads/{goal_id}/events-{bead_id}.jsonl

Browser agent feed pane
  → native WebSocket: GET /conductor/bead/:id/ws
  → conductor polls events file every 500ms, pushes new events to WS clients
  → renders in real time:
      tool_use  → colored badge (Bash/Read/Write/Edit) + path or command
      output    → monospace text
      status    → highlighted status line
      usage     → sticky footer bar (tokens in/out, cost, duration)
  → WS frame {"type":"done","status":"..."} closes the stream

On completion
  → pm / research tickets: bead status → completed, queue item → completed automatically
  → feature / bug / ops tickets: bead status → review_pending
  → review gate fires: agent feed shows diff summary + [Approve] / [Reject]
  → Approve: queue item → completed, bead → completed
  → Reject: bead → failed (retry available), queue item remains active
```

---

## The working directory constraint

**This is the most important technical constraint in the entire system.**

`claude -p` inherits its working directory from the spawning process. The conductor
runs as a service in the evergreen-terrace repo. Without explicit `cwd` override,
every agent invocation would run in the evergreen-terrace directory — not in the
project it's supposed to be modifying.

Every bead stores its working directory:

```toml
[worker]
session_id = "..."
cwd = "/home/nicks-dgx/dev/.Project-Johto/Pokemon"
queue_item_id = "a4f1c8d2-..."
```

This is resolved at dispatch time by reading `context/projects/{project}.toml`:
```toml
[project]
repo = "/home/nicks-dgx/dev/.Project-Johto/Pokemon"
```

If the project TOML is missing or has no `repo` field, the conductor logs a warning
and falls back to the evergreen-terrace root. Tickets dispatched without a valid
project path will operate in the wrong directory — verify project TOMLs before
dispatching feature tickets.

---

## The prompt review gate

Every dispatched bead passes through a prompt review step before the agent runs.
This is intentional — it gives you visibility into exactly what the agent will be
asked to do and a chance to fix it before anything happens.

**What you see in the review panel:**

- **System prompt** — collapsed by default. Shows the character count. Expand to read
  the assembled AGENT.md + skills + steering + conductor-mode instructions + project
  TOML. This is read-only; to change it, edit the source files (agents/, skills/,
  steering/) and re-dispatch.

- **User prompt** — editable textarea, pre-filled with the assembled task brief:
  title, description, acceptance criteria, and any context file paths. This is what
  goes to `claude -p`. Edit freely.

**Dispatching:**

- Click **Dispatch** to run with the prompt as-is.
- Edit the textarea and click **Dispatch with Edits** to run with your changes. The
  edited version is saved to disk before execution, so the events log shows what
  actually ran.
- Click **Reset** to undo your edits and return to the original generated prompt.

**The prompt files persist on disk** at:
```
context/beads/{goal_id}/prompt-{bead_id}.md       ← what went to -p
context/beads/{goal_id}/sysprompt-{bead_id}.md    ← what went to --system-prompt
```

These are your audit trail for what was actually sent to the model.

---

## The code review gate

Feature, bug, and ops tickets involve code changes. The conductor does NOT auto-complete
these tickets. After the agent finishes, the bead enters `review_pending` status and
the agent feed shows an approve/reject panel.

**What the review gate does:**
- Shows you the full agent output (tool calls, output text, token/cost usage)
- Requires explicit [Approve] or [Reject] from you
- Approve: queue item moves to completed
- Reject: bead is marked failed, queue item remains active (retry available)

**What the review gate does NOT do:**
- It does not prevent the agent from making file changes during execution
- It does not diff against git — you need to `git diff` in the project repo yourself
- It does not commit or push anything regardless of outcome

**Agents and git in conductor mode:**
The agent's system prompt includes a conductor-mode instruction: do not run
`git commit`, `git push`, or any git modification commands. The agent may read
git state (`git status`, `git diff`, `git log`) but must not write to it.
This is enforced by instruction, not by tool restriction — `Bash` is still available
because agents need it to run tests, build steps, and linters.

**After approval:** Review the actual diff in the project repo before committing.
The conductor's approval is your sign-off that the output is correct — not that
it's committed.

---

## Ticket type routing

| Type | Prompt review | Code review gate | Auto-complete | Notes |
|------|--------------|-----------------|---------------|-------|
| `feature` | Yes | Yes | No | Review diff before complete |
| `bug` | Yes | Yes | No | Same as feature |
| `ops` | Yes | Yes | No | May touch config/infra — review carefully |
| `pm` | Yes | No | Yes | Produces planning docs; safe to auto-complete |
| `research` | Yes | No | Yes | Read/analysis output; no git risk |
| `design` | Yes | Configurable | No by default | Check agent config |

---

## Bead event types

The event log (`events-{bead_id}.jsonl`) uses structured event types. Each line:

```json
{ "ts": "2026-05-08T14:23:05Z", "type": "status", "content": "..." }
{ "ts": "2026-05-08T14:23:06Z", "type": "status", "content": "Session ready · tools: Read, Write, Edit, Bash" }
{ "ts": "2026-05-08T14:23:10Z", "type": "tool_use", "content": "Read  src/index.ts", "meta": { "tool": "Read", "input": { "file_path": "src/index.ts" } } }
{ "ts": "2026-05-08T14:23:12Z", "type": "output", "content": "The file defines three exports..." }
{ "ts": "2026-05-08T14:23:45Z", "type": "tool_use", "content": "Bash  bun run typecheck", "meta": { "tool": "Bash", "input": { "command": "bun run typecheck" } } }
{ "ts": "2026-05-08T14:25:11Z", "type": "usage", "content": "2,341 in / 847 out · $0.0082 · 12.4s", "meta": { "usage": {...}, "cost": 0.0082, "duration_ms": 12400 } }
{ "ts": "2026-05-08T14:25:11Z", "type": "status", "content": "review_pending" }
```

| Type | When emitted | UI rendering |
|------|-------------|-------------|
| `output` | Agent text content | Monospace, secondary color |
| `status` | Lifecycle transitions, session init | Highlighted, uppercase |
| `error` | stderr, execution failures | Red |
| `tool_use` | Every tool call | Colored badge + path/command, click to expand JSON input |
| `usage` | Final result from claude | Sticky footer bar — always visible after run completes |

The event log persists after the session ends. It's your audit trail for what the
agent did, in what order, and at what cost.

---

## Bead lifecycle diagram

```
prompt_pending  ← bead created, prompts being assembled
    ↓ (user clicks Dispatch)
  pending       ← waiting for a free execution slot
    ↓
 in_progress    ← claude -p is running
    ↓
review_pending  ← agent finished (feature/bug/ops only)
    ↓
 completed      ← approved or auto-completed (pm/research)
    ↓
  failed        ← non-zero exit or explicit reject

failed → pending  (retry)
```

---

## WebSocket stream protocol

The conductor exposes a WebSocket at `GET /conductor/bead/:id/ws`.

The server pushes event frames as the bead executes:
```json
{ "ts": "...", "type": "tool_use", "content": "Read  src/index.ts", "meta": {...} }
```

When the bead reaches a terminal status, the server sends a close frame:
```json
{ "type": "done", "status": "review_pending" }
```

The browser hook uses the native `WebSocket` API. Vite's dev proxy forwards WS
connections via the `ws: true` flag on the `/conductor` proxy entry.

---

## Agent system prompt structure

```
{AGENT.md body — role description and instructions}

---

## Skill: {skill-name}
{SKILL.md content}

---

## Context: {steering-doc}
{steering doc content}

---

## Project Context
The following is the project's context TOML...
```toml
{content of context/projects/{project}.toml}
```

---

## Conductor Mode

You are operating non-interactively via the conductor...
DO NOT run any git write commands...
```

Assembly happens in `prepareBeadPrompt` at dispatch time. The result is saved to
`sysprompt-{bead_id}.md` before the bead runs. If you need to see exactly what was
sent to the model for a past run, read that file.

---

## Current build state (as of 2026-05-09)

| Component | Status |
|-----------|--------|
| Conductor process (goal/bead lifecycle) | Complete |
| Queue → conductor bridge | Complete |
| Working directory (`cwd`) per-bead | Complete |
| Prompt preparation + disk storage | Complete |
| Prompt review panel (UI) | Complete |
| Bead execution via `claude -p` + `stream-json` | Complete |
| Structured event parsing (tool_use, usage) | Complete |
| WebSocket stream endpoint | Complete |
| Browser agent feed (WS client) | Complete |
| Tool badge rendering + usage footer (UI) | Complete |
| Review gate (review_pending status) | Complete |
| Approve/Reject/Retry endpoints | Complete |
| Witness (stall detection + auto-requeue) | Complete |

---

## Failure modes and recovery

**Bead stuck in `prompt_pending` — prompts never appear**
Prompt prep failed. Check the bead's event log for an error event. Most likely cause:
the agent config (`agents/{role}/agent.json`) is missing or malformed, or a referenced
skill file is not found. Fix the config and retry via `POST /conductor/bead/:id/retry`
(which resets to `pending` and skips prompt review — it re-reads saved prompts from disk).

Note: retry from `failed` bypasses the prompt review panel and uses the saved prompt
files. If you want to re-review the prompt before retrying, manually delete the bead
TOML and re-dispatch from the queue item.

**Conductor not running when ticket is dispatched**
Queue dispatch still succeeds. The ticket moves to active/ but no bead is created.
The agent feed pane shows "No conductor session." Start the conductor and re-dispatch,
or fall back to Model A.

**Bead stalls (in_progress > 5 minutes without completion)**
The Witness process automatically resets the bead to `pending` and re-queues it.
This handles `claude -p` hangs.

**Bead fails (non-zero exit code from claude)**
Bead status → `failed`. The agent feed shows the last known output. Retry is
available via the UI Retry button. The queue item remains active.

**Conductor crashes mid-bead**
On restart, conductor resets all `in_progress` beads to `pending` and re-dispatches.
Beads in `prompt_pending` survive as-is — prompt files are still on disk.
The events log up to the crash point is preserved.
