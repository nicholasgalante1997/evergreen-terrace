# evergreen-terrace — User Manual

> **Legacy manual notice:** This manual describes the existing queue/conductor
> workflow. The approved v1 engineering-factory contract is documented in
> [`specs/evergreen-v1/OVERVIEW.md`](specs/evergreen-v1/OVERVIEW.md). V1 is
> additive and must not inherit the legacy direct-CLI, shared-workspace lifecycle.

This is the practical guide to using the system day to day. It covers what to do, in what order, and why each piece exists. For how anything is built, see the docsite (`docsite/`) or the technical docs in `.claude/`.

---

## What this system is for

You are a principal-level engineer running a portfolio of OSS projects without a team. The bottleneck is not your ability — it's the absence of the surrounding team: the PM who grooms the backlog, the engineer who implements the obvious ticket while you work on the hard one, the person who notices a project has been stagnant for three weeks before it becomes a real problem.

evergreen-terrace fills those gaps. It does not automate you out of the loop. It keeps you as the only human in the loop — but only at the decisions that require your judgment: what to build, whether the output is good enough, and what deserves attention right now.

The system has three parts that you interact with:

1. **The web dashboard** — where you see what's happening, inspect work, dispatch it, and review results
2. **The sentinel** — a scoring run that tells you which projects are healthy and which ones are drifting
3. **The agent team** — eight role-scoped agents that do specific work when invoked, either interactively through Claude Code or automatically through the conductor

---

## Prerequisites

Before you can run anything:

- **Bun** `>= 1.3.13` — `bun --version` to check
- **Claude Code CLI** — `claude --version` must work; this is how agents are invoked
- **mise** (optional but recommended) — `mise --version`; gives you the task runner
- **ANTHROPIC_API_KEY** set in your environment

On the DGX, these should all be present. Verify with:

```bash
bun --version
claude --version
echo $ANTHROPIC_API_KEY   # should print your key, not blank
```

---

## First-time setup

```bash
cd ~/dev/evergreen-terrace
bun install
cp .env.example .env
```

Open `.env` and set `QUEUE_ROOT` to the absolute path of this directory:

```
QUEUE_ROOT=/home/nicks-dgx/dev/evergreen-terrace
```

That is the only required variable. It tells every service where to find the queue, context, and bead state.

---

## Starting the system

Everything starts with one command:

```bash
bun run start
# or, if you have mise:
mise run start
```

This builds all services (first time, or after code changes) and starts:

| Service | Port | What it does |
|---------|------|-------------|
| queue-server | 2727 | Manages work items |
| sentinel | 2730 | Scores project health, serves reports |
| metrics | 2729 | Collects events, feeds charts |
| conductor | 2731 | Runs agents on dispatched work items |
| web dashboard | 2728 | The UI you actually look at |

After about 3 seconds, your browser opens automatically to `http://localhost:2728`.

To skip the rebuild (faster restart after a pause):

```bash
bun run start:dev
# or: mise run start:dev
```

To start without opening the browser:

```bash
bun run start:headless
```

Press **Ctrl+C** to stop everything cleanly.

---

## Accessing the dashboard remotely

If you're developing from your laptop over SSH, the services are only accessible on the DGX. Use the tunnel script to forward all ports to your local machine:

```bash
# On your laptop:
~/bin/evergreen-tunnel           # uses $EVERGREEN_HOST or the default alias
~/bin/evergreen-tunnel nicks-dgx  # explicit target
```

After the tunnel is up, `http://localhost:2728` works from your laptop browser just as if you were local. The script opens the browser for you automatically on macOS.

Set up once:
```bash
scp nicks-dgx:~/dev/evergreen-terrace/scripts/tunnel.sh ~/bin/evergreen-tunnel
chmod +x ~/bin/evergreen-tunnel
```

Install `autossh` for automatic reconnection if the tunnel drops (`brew install autossh` on macOS).

---

## The web dashboard

The dashboard has three tabs at the top: **Queue**, **Sentinel**, and **Metrics**.

### Queue tab

This is where you spend most of your time. It has up to three panes depending on what you've selected:

**Left sidebar** — the item list. Three sections:

- **Inbox** — work that has been created but not started. Sorted by priority (p0 first). This is the backlog.
- **Active** — work that has been dispatched to an agent. If the conductor is running, an agent is working on it. If not, you are.
- **Completed** — finished items, kept for reference.

Click any item to select it. Click again to deselect.

**Center pane** — item detail. When you select an item, this shows everything about it:

- Title, priority badge, type, project
- Created date, dispatched date
- **Description** — the full context for why this work exists and what the current state is
- **Acceptance criteria** — what "done" looks like, rendered with checkboxes so you can see at a glance how complete it is
- **Links** — context files and specs the agent should read first

**Right pane** — agent feed. Visible only when an active or completed item is selected. Its contents depend on bead state:

| Bead state | What you see |
|-----------|-------------|
| `prompt_pending` | Prompt review panel — system prompt (collapsible) + user prompt (editable textarea) + Dispatch button |
| `pending` / `in_progress` | Live event stream: tool calls (Read/Write/Bash with colored badges), output text, status lines |
| `review_pending` | Full event log + Approve & Complete / Reject buttons |
| `completed` | Final event log with token/cost footer |
| `failed` | Event log with error + Retry button |
| no session | "No conductor session" — conductor is not running or item was not dispatched through it |

**Actions at the bottom** of the center pane:

- Inbox items: agent selector (pre-populated from the ticket) + **Dispatch →** button
- Active items: **✓ Mark Complete** (manual) + **↩ Return to Inbox** buttons
- Active items with a conductor bead in `review_pending`: **Approve & Complete** / **Reject** in the agent feed pane

### Sentinel tab

Shows the latest momentum report. At the top:
- Mode (on-demand or cron), last run time, next scheduled run (if cron)
- **Run Now** — triggers a sentinel run immediately; output appears in the report area as it writes

The report is raw markdown from the sentinel agent — project scores, what's healthy, what's at-risk, what needs immediate attention. See "Running the sentinel" below.

### Metrics tab

Charts populated by the metrics service: queue velocity (items in/out over time), project health history (sentinel score trends), and work item age distribution.

---

## Your daily routine

This is the intended loop. It is not prescriptive — use what serves you.

### Weekly: run the sentinel

The sentinel scores all active projects. Run it from the Sentinel tab → **Run Now**, or from the terminal:

```bash
mise run sentinel-run
```

Read the report. It ranks projects from most urgent to healthiest and tells you why. The top of the list is where your attention should go.

After the run, the sentinel updates each project's TOML in `context/projects/` with the latest health score. This feeds the Metrics charts over time.

### As needed: review the queue and dispatch work

Open the Queue tab. Look at Inbox, sorted by priority. Select items to read them fully — the description and acceptance criteria are the brief for each piece of work.

When you're ready to start something:

1. Select the inbox item
2. Check the suggested agent in the dropdown (the PM chose this when creating the item)
3. Change the agent if needed
4. Click **Dispatch →**

What happens next depends on whether the conductor is running:

- **Conductor running:** the item moves to Active, the conductor starts working on it immediately, and you can watch the agent feed in the right pane
- **Conductor not running:** the item moves to Active, shows "No conductor session" — you work on it yourself in a Claude Code session using the ticket as your brief (see "Model A" below)

### When a feature or code item completes via conductor

Code-producing work (type: `feature`, `bug`, `ops`) does NOT auto-complete when the agent finishes. It enters `review_pending` state and the agent feed shows an approve/reject panel.

**Before clicking Approve:** open a terminal, `cd` into the project directory, and review the diff:

```bash
cd ~/dev/.Project-Johto/Pokemon
git diff
git status
```

If the output looks right, click **Approve & Complete** in the dashboard. The item moves to Completed.

If it's wrong, click **Reject** — the bead is marked failed and you can retry or rework it manually.

**Approved does not mean committed.** The agent cannot commit. After approving, you commit the changes yourself:

```bash
git add -p   # stage what you want
git commit -m "..."
```

---

## Working with queue items

### Creating items

The intended path is the PM agent. In a Claude Code session:

```
/pm
"I need a ticket for implementing Phase 2 of the foresight analysis engine. The spec is in ~/dev/foresight/specs/."
```

The PM agent asks clarifying questions (two rounds max), then writes TOML files directly to `queue/inbox/`. They appear in the web UI immediately.

You can also write items manually — see the README for the TOML schema. It is straightforward: title, project, type, priority, description, acceptance, links.

### Creating items from a sentinel report

The sentinel report is the primary input for new queue items. After a sentinel run, the report will call out specific projects and next actions. The intended flow is to use the sentinel report in conjunction with the PM agent to create well-specified tickets — which is exactly what the session that created the current queue items was.

### Item lifecycle

```
inbox/ → active/ → completed/
         ↑
      (return to inbox)
         ↑
      (reject from review)
```

Files move between directories as state changes. The queue server manages this atomically — the inbox file is deleted only after the active file is written.

---

## Running the sentinel

The sentinel is a Claude Code session pre-loaded with the momentum-sentinel agent's system prompt. It:

1. Reads `context/global.toml` for priority ordering
2. Reads all `context/projects/*.toml` for project state
3. Reads `queue/inbox/` and `queue/active/` for queue state
4. Runs `git log` for each project repo to check actual activity
5. Scores each project on four dimensions (0–100)
6. Writes a ranked report

**Running it:**

From the web dashboard Sentinel tab → **Run Now**

From the terminal:
```bash
mise run sentinel-run
```

From a Claude Code session in this repo (invokes the agent interactively):
```bash
claude  # then: /momentum-sentinel
```

**Reading the report:**

Projects are ranked from most urgent to healthiest. A score of 0–49 is stale, 50–74 is at-risk, 75–100 is healthy. The report gives 2–3 sentences of context per project and a specific next action.

Pay attention to the **MISALIGNMENT** flags — these indicate a p0 or p1 project that has had no commits in 14+ days. That means either the project has been quietly abandoned or it's being worked on without commits (both problems).

**After the run:**

The sentinel writes updated `health` scores to each project TOML. It does NOT change `priority` — that's yours to set. If a project's context has changed (different phase, new architecture decisions), update its TOML manually.

---

## Working with agents

There are two modes. The workflow docs in `.claude/workflows/` go into detail. The short version:

### Model A — You + Claude Code + ticket as brief

Best for: complex work, exploratory sessions, anything cross-cutting multiple projects.

1. Select an inbox item in the dashboard
2. Read the description and acceptance criteria
3. Note the `links` field — those are the files to load first
4. Dispatch it to Active (records intent)
5. Open Claude Code in the project's repo:
   ```bash
   cd ~/dev/.Project-Johto/Pokemon
   claude
   ```
6. Paste the description and acceptance as your opening context
7. Work interactively until acceptance criteria are met
8. Mark Complete in the dashboard when done

The ticket is a pre-written brief. The acceptance criteria were written to be agent-ready.

### Model B — Conductor automation

Best for: well-scoped, spec-complete tickets where the acceptance criteria are unambiguous.

1. Make sure the conductor is running (`bun run start` includes it)
2. Dispatch a ticket from the dashboard — the item moves to Active
3. **Review the prompt** — the right pane shows a prompt review panel:
   - System prompt (collapsed): assembled from the agent's AGENT.md, skills, steering docs, and the project TOML. Read-only.
   - User prompt (editable): the task brief sent to `claude -p`. Edit if the generated text is wrong, missing context, or needs sharpening.
   - Click **Dispatch** (or **Dispatch with Edits** if you changed anything)
4. Watch the agent feed — output streams in real time with structured event types:
   - **Tool calls** appear as colored badges: Read (blue), Write/Edit (accent), Bash (red)
   - **Text output** streams as the agent narrates its work
   - **Token/cost footer** appears at the bottom once the run completes
5. For `feature`, `bug`, `ops` tickets: the feed shows **Approve & Complete** / **Reject** when the agent finishes — review the git diff first, then decide
6. For `pm`, `research` tickets: auto-completes when the agent finishes

The conductor runs `claude -p` with `--output-format stream-json` in the project's working directory. It injects the project's context TOML into the system prompt so the agent understands the project's state. This only works if the project's TOML has a `repo` field — verify this if a ticket dispatches but the prompt review panel shows no system prompt.

---

## Managing project context

Every project under management has a TOML file in `context/projects/`. This is the system's memory — the sentinel reads it, the conductor uses it to find the working directory, and it feeds into the Metrics charts over time.

The critical fields:

```toml
[project]
name = "foresight"
repo = "/home/nicks-dgx/dev/foresight"    # REQUIRED for conductor to work

[status]
priority = "p1"       # YOU set this
phase = "active-feature"
last_touched = "2026-05-08"   # Update when you work on the project
health = "at-risk"            # Set by the sentinel — don't change manually

[notes]
context = "..."        # Architecture facts, current state, decisions made
next_action = "..."    # What a future session should start from
```

**Keep `last_touched` current.** The sentinel scores Context Freshness — a stale `last_touched` drags the score down and produces inaccurate reports. When you finish a session on a project, update the date.

**Keep `next_action` honest.** This is what you (or an agent) should do next. Make it specific enough to be actionable without re-reading the codebase.

**Keep `repo` set.** Without this, the conductor cannot run agents in the right directory. Any feature/bug ticket will fail to execute correctly.

---

## mise tasks quick reference

| Task | What it does |
|------|-------------|
| `mise run start` | Build everything, start all services, open browser |
| `mise run start:dev` | Start all services (skip rebuild), open browser |
| `mise run start:headless` | Build and start, no browser |
| `mise run queue` | Start queue-server only (port 2727) |
| `mise run sentinel` | Start sentinel server only (port 2730) |
| `mise run conductor` | Start conductor only (port 2731) |
| `mise run dashboard` | Start web dashboard dev server only (port 2728) |
| `mise run sentinel-run` | Trigger an immediate sentinel run |
| `mise run queue:ls` | Print inbox/active/completed counts |
| `mise run health` | Check which services are running |
| `mise run sync-agents` | Push agent definitions to `~/.claude/agents/` |
| `mise run build` | Build all packages |
| `mise run typecheck` | Type-check all packages |

---

## When things go wrong

**Queue-server unreachable in the dashboard**
The web UI shows "queue-server unreachable." Start the queue server: `mise run queue` or restart with `bun run start`.

**Conductor dispatches but agent feed shows "No conductor session"**
Either the conductor is not running, or the project TOML is missing the `repo` field. Check:

```bash
mise run health
cat context/projects/{project}.toml | grep repo
```

**Bead stuck on "Building Prompt…" — prompt review panel never appears**
Prompt preparation failed. The conductor reads the agent's `agent.json`, AGENT.md, and any referenced skill or steering files to assemble the system prompt. Check that the agent role set on the ticket actually exists in `agents/`. Also verify any skills listed in `agent.json` have a corresponding `SKILL.md` in `skills/`. The bead's event log will have an error event explaining what failed:

```bash
cat context/beads/goal-*/events-bead-*.jsonl | grep '"type":"error"'
```

**Sentinel "Run Now" returns an error**
The sentinel server must be running separately from the sentinel agent. `bun run start` starts it. Check `mise run health` to confirm port 2730 is up.

**Agent ran but output looks wrong**
The agent feed in the right pane shows the full output. Read through it — the agent usually explains what it did. For review_pending items, reject the bead and either retry or switch to Model A and do it interactively.

**`bun run start` fails on build**
Run `bun run typecheck` to find the error. Usually a type mismatch from a recent change. Fix and retry.

**Conductor bead stalled**
The Witness process checks every 60 seconds and automatically re-queues any bead that has been `in_progress` for more than 5 minutes. If a bead is stalled shorter than that, wait. If it keeps failing, check the agent feed for the error and retry with `POST /conductor/bead/:id/retry` or use the Retry button in the feed pane.

**Project context is stale after a session**
The sentinel will flag it. Update the project TOML manually:
```bash
# In context/projects/{project}.toml:
# - Update last_touched
# - Update notes.context with anything new
# - Update notes.next_action
```

**Agents are outdated after editing `agents/`, `skills/`, or `steering/`**
The PostToolUse hook in `.claude/settings.json` syncs automatically when you edit these files in Claude Code. Manual sync: `mise run sync-agents`.

---

## What this system does not do

- It does not commit, push, or merge code. That is yours.
- It does not make product decisions. It helps you make them faster.
- It does not replace reading the output. Agent work requires your review.
- It does not manage projects that are not in `context/projects/`. If a project is not registered, the sentinel ignores it.
- It does not send external communications. The `stakeholder` and `voice` agents produce drafts.
