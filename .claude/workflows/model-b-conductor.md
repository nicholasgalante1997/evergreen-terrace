# Model B — Conductor Workflow

Dispatching a ticket from the web UI triggers the conductor, which invokes
`claude -p` non-interactively in the project's working directory. Output streams
to the browser in real-time. Code-producing tickets require your explicit approval
before they are marked complete.

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
  → bead inherits: description, acceptance, links from queue item
  → bead.worker.cwd = project repo path  ← CRITICAL CONSTRAINT

Bead execution (polecat)
  → Bun.spawn(["claude", "-p", prompt, "--system-prompt", ...], { cwd: project_repo })
  → streams stdout to context/beads/{goal_id}/events-{bead_id}.jsonl line by line
  → conductor exposes SSE: GET /conductor/bead/:id/stream

Browser agent feed pane
  → subscribes to SSE stream for the active bead
  → renders output in real time as the agent works

On completion
  → pm / research tickets: bead status → completed, queue item → completed automatically
  → feature / bug / ops tickets: bead status → review_pending
  → review gate fires: agent feed shows diff summary + [Approve] / [Reject]
  → Approve: queue item → completed, bead → completed
  → Reject: bead → failed (retry available), queue item returns to active
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

## The review gate

Feature, bug, and ops tickets involve code changes. The conductor does NOT auto-complete
these tickets. After the agent finishes, the bead enters `review_pending` status and
the agent feed shows a review panel.

**What the review gate does:**
- Shows you the agent's output and what files were touched
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

| Type | Review gate | Auto-complete | Notes |
|------|------------|---------------|-------|
| `feature` | Yes | No | Runs in project dir; review diff before complete |
| `bug` | Yes | No | Same as feature |
| `ops` | Yes | No | May touch config/infra — review carefully |
| `pm` | No | Yes | Produces planning docs; safe to auto-complete |
| `research` | No | Yes | Read/analysis output; no git risk |
| `design` | Configurable | No by default | Check agent config |

---

## Agent system prompt in conductor mode

When executing a bead, the conductor assembles the system prompt as:

```
{role AGENT.md}
{skills}
{steering docs}
---

## Conductor Mode

You are operating non-interactively via the conductor. You are working in:
  {project repo path}

Do NOT run any git write commands (git commit, git push, git reset, git checkout -b,
git merge, git rebase). You may read git state (git status, git diff, git log).

Your task is complete when all acceptance criteria are satisfied. Output a brief
summary of what you did at the end.

## Project Context
{content of context/projects/{project}.toml}

## Task
{queue item description + acceptance criteria}
```

---

## Bead event log

Each bead writes real-time output to:
```
context/beads/{goal_id}/events-{bead_id}.jsonl
```

Each line is a JSON object:
```json
{ "ts": "2026-05-08T14:23:05Z", "type": "output", "content": "Reading SPEC_01..." }
{ "ts": "2026-05-08T14:23:07Z", "type": "status", "content": "in_progress" }
{ "ts": "2026-05-08T14:25:11Z", "type": "status", "content": "review_pending" }
```

The event log persists after the session ends. It's your audit trail for what
the agent did and in what order.

---

## Current build state (as of 2026-05-08)

| Component | Status |
|-----------|--------|
| Conductor process (goal/bead lifecycle) | Complete |
| Bead execution via `claude -p` | Complete — no cwd, no streaming |
| Working directory (`cwd`) support | **In progress** |
| Queue → conductor bridge | **In progress** |
| Streaming events log | **In progress** |
| SSE stream endpoint | **In progress** |
| Review gate (review_pending status) | **In progress** |
| Browser agent feed pane | **In progress** |
| Approve/Reject endpoints | **In progress** |

---

## Failure modes and recovery

**Conductor not running when ticket is dispatched**
Queue dispatch still succeeds. The ticket moves to active/ but no bead is created.
The agent feed pane shows "No conductor session." You can manually retry by running
`bun run conductor` and using the retry endpoint, or fall back to Model A.

**Bead stalls (in_progress > 5 minutes without completion)**
The witness process automatically resets the bead to `pending` and re-queues it.
This handles `claude -p` hangs.

**Bead fails (non-zero exit code from claude)**
Bead status → `failed`. The agent feed shows the last known output. Retry is
available via the UI (POST /conductor/bead/:id/retry). The queue item remains
active.

**Conductor crashes mid-bead**
On restart, conductor resets all `in_progress` beads to `pending` and re-dispatches.
The events log up to the crash point is preserved.
