# Evergreen Terrace v1 host bridge and MCP tools

## Boundary

`services/host-bridge` is a native host process, never a Compose container. It
owns only narrowly-scoped capabilities that require the engineer's machine:

- Read-only local Git inspection and verified local commit resolution.
- Explicit `git fetch --prune` against the configured remote.
- Reading strict `.et/config.toml` policy.
- Submitting approved goal commands to the loopback command API.
- Requesting and recording resolution of durable decision cards.
- Preparing deterministic factory-owned worktrees outside the active checkout.

It has no arbitrary shell, filesystem, SQL, prompt, or worktree tool. Its
argv-based Git executor never invokes a shell. It does not mount a checkout or
credential store into the control plane.

## Transports

The bridge uses the owned `@evergreen-terrace/mcp-core` JSON-RPC dispatcher and
static first-party tool registry. No external MCP SDK is installed.

| Transport | Start command          | Endpoint/framing                                                                                                                                                |
| --------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stdio     | `bun run bridge:stdio` | Newline-delimited JSON-RPC 2.0 on stdin/stdout. Stdout is protocol only; lifecycle logs use stderr.                                                             |
| HTTP      | `bun run bridge:http`  | Stateful loopback `POST http://127.0.0.1:7450/mcp`; initialize returns `Mcp-Session-Id`, which subsequent calls send as a header. `DELETE /mcp` ends a session. |

The implementation supports the 2025-06-18 and 2025-11-25 handshake protocol
versions. It provides `initialize`, `notifications/initialized`, `ping`,
`tools/list`, and `tools/call`. HTTP currently uses JSON responses for the
bounded request/response tool set; server-initiated prompts and streaming events
are not implemented in this slice.

## First-party tool registry

| Tool                          | Effect                                                                           | Policy behavior                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `evergreen.workspace.status`  | Reads local branch, HEAD SHA, canonical remote URL, and project identity.        | Read-only.                                                                                                       |
| `evergreen.goal.submit`       | Resolves a permitted local base ref and submits one durable goal.                | Parses `.et`, validates priority/base ref, and never writes the active checkout or starts workers.               |
| `evergreen.decision.request`  | Persists an ambiguity or risk decision card.                                     | Cannot carry out the proposed action. Decision options and recommendation are immutable request evidence.         |
| `evergreen.decision.resolve`  | Records an engineer's approved or rejected option.                               | Resolution alone never pushes, merges, releases, or performs another external side effect.                       |
| `evergreen.workspace.sync`    | Fetches/prunes the configured remote and refreshes GitHub metadata through `gh`. | Requires `confirm: true`; never pulls, resets, switches, or modifies the active checkout.                        |
| `evergreen.worktree.prepare`  | Creates one factory-owned worktree and feature branch for a durable goal.        | Validates the configured base ref and branch class; writes only to the local factory root and Git's metadata.     |
| `evergreen.worker.prepare`    | Creates a worktree and records an assigned Claude or Codex worker.               | Persists immutable worktree/branch/artifact provenance through the command API; does not launch the adapter yet.  |
| `evergreen.worker.run`        | Records a durable brief and runs one assigned worker under a scheduler lease.     | Only confined read-only commands (and opted-in validation commands) are automatic; everything else is a decision card. |
| `evergreen.worker_pool.run`   | Records briefs for two to six workers and starts a durable, lease-based schedule. | Returns immediately unless `wait: true`. Starts only dependency-ready workers; a failed/cancelled dependency durably fails its unstarted dependent. |
| `evergreen.schedule.status`   | Reports a goal's workers with state, brief digest, and lease holder.              | Read-only, strongly consistent command lookup.                                                                    |
| `evergreen.schedule.resume`   | Resumes a goal's schedule from durable state after a restart.                     | Reconciles expired leases first; an active session that lost its lease is failed, never replayed.                 |
| `evergreen.validation.run`    | Captures and validates one completed worker's exact commit.                       | `.et` commands in a read-only sandbox; checks offline; credential-free environment.                               |
| `evergreen.integration.run`   | Composes a goal's workers on a per-goal factory branch and revalidates.           | Records intent first; conflicts are aborted and recorded; exclusions need a rationale; never pushes.              |
| `evergreen.integration.resolve` | Re-runs a `conflicted` attempt with the integrator agent resolving conflicts.   | Integrator edits are cards; the host commits only a verified, in-scope resolution, then revalidates.              |
| `evergreen.integration.status`| Lists a goal's integration attempts and validation evidence.                      | Read-only, strongly consistent command lookup.                                                                    |
| `evergreen.handoff.request`   | Plans the push and PR for a validated integration.                                | Records the plan and an `external_side_effect` decision card; never contacts GitHub.                              |
| `evergreen.handoff.execute`   | Performs an approved plan exactly: push, open or reuse the PR, supersede comment. | Refused until approved; no force push, no merge; a re-run reconciles finished steps.                              |
| `evergreen.handoff.status`    | Lists a goal's handoffs with plan, decision, result, and exact PR body.           | Read-only, strongly consistent command lookup.                                                                    |
| `evergreen.onboarding.discover` | Runs 2-4 read-only discovery agents and the mayor over the base commit, then records one approval packet. | Read-only sessions; the host composes `.et/config.toml` itself; one `onboarding` decision card. Never fetches or writes. |
| `evergreen.onboarding.apply` | Commits exactly the approved `.et/config.toml` on a new factory branch and validates it there. | Refused until the card is resolved; never touches the active checkout or a protected branch; never pushes. |
| `evergreen.onboarding.status` | Lists this repository's onboarding attempts with packet, card, and result. | Read-only, strongly consistent command lookup. |
| `evergreen.plan.draft` | The mayor plans a submitted goal: contract, scope-claimed tasks, dependency graph, briefs, risks. | Read-only mayor session; output schema- and host-checked; one `plan_approval` card, or `ambiguity` cards for questions. |
| `evergreen.plan.launch` | Creates one worktree and worker per approved task, records briefs, starts the schedule. | Refused until the plan card is resolved; any resolution but `approve` rejects the plan; idempotent after a crash. |
| `evergreen.plan.status` | Lists a goal's plan revisions with full briefs, scope claims, overlaps, and launched workers. | Read-only, strongly consistent command lookup. |
| `evergreen.preference.propose` | Proposes a learned tone/verbosity/runner/workflow/convention preference. | Low-impact with 2+ distinct evidence and no change to a held value promotes; anything else is a `preference` card. Policy keys are refused. |
| `evergreen.preference.list` | Lists the preferences in effect for this project (optionally with history). | Read-only. |
| `evergreen.jarvis.ask` | Jarvis answers a question from a host-written read-model snapshot, with cited claims and proposed actions. | Read-only session over the evidence only; citations and proposal arguments are host-checked; performs no action. |

Tool arguments are strict JSON schemas. Tool errors return an MCP tool result
with `isError: true`; malformed JSON-RPC receives a JSON-RPC error response.

## Worktree provenance

The bridge derives every worktree and manifest path from canonical project ID,
immutable goal ID, worker role, and attempt. The default factory root is
`$XDG_STATE_HOME/evergreen-terrace` or `~/.local/state/evergreen-terrace`; set
`ET_FACTORY_ROOT` to override it. Worktree preparation atomically writes a
manifest containing the local base SHA, generated factory branch, paths, role,
attempt, and timestamp. V1 does not clean these records or worktrees.

If durable worker registration fails after Git created a worktree, the bridge
writes an atomic `worker-registration.failure.json` alongside its manifest. The
failure record gives recovery tooling the exact worktree and manifest rather
than silently recreating or deleting either resource.

## ACP worker foundation

`AcpWorkerRunner` speaks ACP to the installed `claude-agent-acp` or `codex-acp`
adapter from a factory worktree. It records initialization, streamed updates,
permission requests, permission responses, adapter stderr, and its result under
the worktree artifact root. It removes direct provider API-key environment
variables and relies on the engineer's installed plan-authenticated harness.

Codex workers do not share the engineer's live SQLite/WAL runtime state. The
bridge creates `codex-home` and `sandbox-tmp` under the worker's preserved
artifact directory, sets `CODEX_HOME` to that isolated runtime home, mounts only
the engineer's existing Codex `auth.json` read-only, and exposes the private
temporary directory as `/tmp`. Bubblewrap supplies a minimal `/dev` for runtime
entropy/device access. This preserves plan authentication without giving an ACP
worker write access to the interactive Codex state, daemon sockets, or home tree.

`evergreen.worker.run` binds the runner to the durable worker lifecycle. It
changes an assigned worker to `running`, records its result, and ends it as
`completed` or `failed`. A small class of commands is approved automatically
(see "Automatic command approval"). Every other ACP permission request becomes a
`security` decision card, and the worker waits in `awaiting_decision` until the
engineer resolves it.

### Automatic command approval

`automaticApprovalRule` (`worktree-permission-policy.ts`) approves an ACP v1
request once, without a card, only when all of the following hold.

**The request:**

- It is `toolCall.kind: execute` and offers `allow_once`.
- Its working directory (`rawInput.cwd`, if given) resolves inside the
  worktree, symlinks included.
- The command (`rawInput.command`: a Claude script string, or a Codex argv,
  including `bash -lc <script>`) is **one simple command**. It contains no
  pipes, `;`, `&&`, redirects, `$`, backticks, globs, escapes, comments, or
  newlines (`shell-words.ts`). Codex argv elements must be plain text.

**Then either:**

- **Read-only allowlist** (`command-allowlist.ts`): the program is one of `cat
  cut diff du file find grep head ls pwd rg sort stat tail tree wc`, or `git
  blame|branch|diff|log|ls-files|rev-parse|show|status`. The command also
  passes these checks:
  - Write, exec, or follow flags are refused, including in clustered or
    attached forms. For example `find -exec/-delete`, `rg --pre`, `sort -o`,
    and `tail -f`.
  - Git global options (`-c`, `-C`) and `--output`, `--ext-diff`, and
    `--textconv` are refused, and `git branch` may only list.
  - Programs given as a path are refused.
  - Every non-flag argument and every `--flag=value` value must resolve inside
    the worktree, following symlinks. `~` is refused, so `cat ~/.ssh/id_rsa`,
    `cat /proc/self/environ`, and an in-worktree symlink to an outside file all
    become cards.
- **Validation commands** (opt-in): the script exactly equals one of the
  project's `.et` `validation.commands`, and the project sets
  `[permissions] auto_approve_validation_commands = true`. It is off by
  default. These commands run repository code inside the worker sandbox, which,
  unlike the validation sandbox, has network access and the plan-auth home
  mounted. Setup commands are never auto-approved.

Every resolution is logged in `acp.events.ndjson` as `permission.resolved`,
with `via` (`automatic` or `decision`), `granted`, and either the matched
`rule` (for example `read_only:git-status`, `validation_command`) or the
`decisionId`. Command text is never logged. Adapters may skip permission
entirely for commands they consider harmless; for example `claude-agent-acp`
did not ask about `ls` in the live check.

`completed` means the agent ended its turn (`end_turn`), not that it did the
work. In the live exercise a worker whose only write was rejected still ended
`completed`. Validation and integration verify output; completion does not.

### Permission cards

Cards and the `permission.requested` artifact record are built from the ACP
`toolCall` (`acp-permission.ts`, `permission-decision-card.ts`):

- **Title:** `<role>: <kind> <first location>`, for example
  `api: edit notes/api.md`.
- **Context:** the action kind; the agent's title, for file kinds only; and every
  location relative to the worktree.
- **Outside the worktree:** a location there is shown as an absolute path and
  flagged `OUTSIDE the worker worktree` in both title and context.
- **Withheld text:** command lines (`execute`) and URLs (`fetch`) are never
  copied, because they may carry credentials. The card says so and points to
  `acp.events.ndjson`. Raw `rawInput` is never persisted.

Approval selects `allow_once`; persistent `allow_always` is never offered.

## Durable worker scheduler

`WorkerScheduler` (`src/workers/worker-scheduler.ts`) replaces the earlier
request-bound pool. Each worker assignment carries zero to sixteen immutable
prerequisite worker IDs; the command API accepts an edge only when its
prerequisite already exists and belongs to the same goal.

The schedule is durable because its inputs are command state, not MCP request
state:

1. **Briefs.** `evergreen.worker_pool.run` and `evergreen.worker.run` first
   record each worker's prompt as an immutable brief
   (`POST /v1/workers/:id/brief`). Re-recording the same text is idempotent;
   different text is refused. Events carry only the SHA-256 digest and length.
2. **Leases.** Before launch the scheduler acquires a lease
   (`POST /v1/workers/:id/lease`) under its identity
   `host-bridge:<hostname>:<pid>:<random>`. The command API refuses
   `assigned -> running` without a live lease held by the caller, and while a
   lease is live only its owner may move the worker (an engineer `cancelled`
   stop is always accepted).
3. **Renewal.** `WorkerLeaseKeeper` renews every TTL/3 (default TTL 90 s,
   `ET_WORKER_LEASE_TTL_SECONDS`, bounded 15-600 s). A refused renewal aborts
   the ACP session through an `AbortSignal`; a session never outlives its lease.
4. **Release.** After the worker reaches a terminal state the scheduler releases
   its own lease. Release is refused while a worker is `running` or
   `awaiting_decision`.
5. **Reconciliation.** On every start, the scheduler reconciles other
   schedulers' expired leases. An expired lease on an `assigned` worker is
   simply cleared. An expired lease on a `running`/`awaiting_decision` worker
   records `worker.lease_expired` and fails the worker: liveness and side
   effects cannot be proven, so the session is never replayed. Retry by
   preparing a new attempt.

`start` runs in the background and serializes repeated starts for one goal.
`evergreen.schedule.resume` re-reads the goal and continues it; workers with a
live lease elsewhere, or legacy `running` rows with no lease, are reported
`blocked` and never receive a second session.

Run the bridge with `--transport=http` for long background schedules. Under
stdio the bridge exits with its MCP client; Bubblewrap's `--die-with-parent`
then ends the adapter, the lease expires, and the next resume fails that worker.

## `.et/config.toml`

Every target repository must have a versioned `.et/config.toml` before the
bridge accepts a goal. The strict schema rejects unknown fields and bounds
factory capacity to the approved v1 limits: four concurrent goals and three to
six workers per repository.

```toml
version = 1
project_id = "github.com/owner/repository"
canonical_remote = "origin"
priority_classes = [{ name = "p0", weight = 100 }, { name = "p1", weight = 50 }]

[goals]
max_concurrent = 4

[workers]
default_per_goal = 3
max_per_repository = 6

[branches]
protected = ["main", "dev"]
allowed_base_refs = ["main", "dev"]
classes = [{ name = "feature", prefix = "feature/" }]

[validation]
setup = ["bun install --frozen-lockfile"]   # optional; the only phase with network
commands = ["bun run typecheck"]            # offline checks
timeout_seconds = 1200                      # optional, per command, 10-7200

[permissions]                               # optional
auto_approve_validation_commands = false    # exact-match .et checks run by workers without a card

[risk]
decision_required = ["migration", "security", "external_side_effect"]
```

The worker roles `integration` and `integrator` are reserved for the
integration train; `evergreen.worker.prepare` refuses them.

## Validation and integration train

### Validation sandbox

`ValidationRunner` runs each `.et` command as `/bin/sh -c <command>` under
Bubblewrap:

- The root filesystem is read-only, including `HOME`.
- Only the worktree, a private `/tmp`, and the factory dependency cache
  (`$ET_FACTORY_ROOT/cache`, exposed as `XDG_CACHE_HOME` and
  `BUN_INSTALL_CACHE_DIR`) are writable.
- `setup` commands may use the network. `commands` run with `--unshare-net`.
- The environment is rebuilt from `HOME`, `LANG`, `PATH`, and `USER` only, so
  credentials in the bridge's environment never reach project scripts.
- Every command is killed after `timeout_seconds` and recorded as timed out.
- Setup stops at the first failure. Checks always all run, so a failing
  validation still carries complete evidence.
- Logs go to `NN-<phase>.stdout.log` / `.stderr.log` beside the record.

Validation requires a clean worktree and records the exact `HEAD` commit it
tested.

### `evergreen.validation.run`

Validates one `completed` worker. Any uncommitted output is first captured as a
factory commit on the worker's own branch. The tool then validates that commit
and records `validation.completed`.

### `evergreen.integration.run`

Runs one integration-train attempt for a goal:

1. It refuses, recording nothing, unless every worker is `completed` or
   `cancelled` and at least one is `completed`.
2. It records intent (`integration.updated`, `started`) and allocates the next
   attempt number before any Git side effect.
3. It captures uncommitted worker output as a factory commit on each worker
   branch.
4. It creates a fresh integration worktree on `<class>/et-<goal>/integration`
   (with an `-aN` suffix for later attempts). The worktree is pinned to the
   goal's recorded base SHA, not the base ref's current tip.
5. It merges sources with `--no-ff` in dependency order, keeping assignment
   order for ties. It records files touched by more than one source as
   `overlaps`.
6. On a conflict it runs `git merge --abort`, records the conflicting paths
   and worker, and ends `conflicted`. The worktree is never left half-merged.
7. Otherwise it writes `aggregate.diff` (binary-safe, with SHA-256 and stats),
   revalidates the composed head, and ends `validated` or
   `validation_failed`.
8. An unexpected failure after step 2 ends the attempt `blocked` with the
   error detail.

Factory commits and merges use a fixed identity
(`Evergreen Terrace Factory <factory@evergreen-terrace.invalid>`). They pass
`--no-verify` and disable signing, so unattended work cannot block on hooks or
a signing prompt; `.et` validation is the gate. Nothing is pushed, and protected
branches are refused when a worktree is created. Each run is a new attempt; no
attempt is cleaned up.

**Selection.** `excludeWorkerIds` leaves chosen worker output out of an attempt.
A `selectionRationale` is required, and excluding a worker whose dependent stays
included is refused. The exclusion and its rationale are recorded in the
completion's `selection` and shown in the goal PR.

### Integrator agent: `evergreen.integration.resolve`

`resolve` takes a `conflicted` attempt and runs a new attempt that references it
(`resolvesIntegrationId`), inheriting its selection. The new attempt merges in
the same dependency order. When a merge conflicts, it is left **open** instead
of aborted, and `ConflictIntegrator` takes over:

1. It assigns an ACP worker with the reserved role `integrator` (no ordinary
   worker may claim it). The worker runs in the integration worktree, with its
   own artifact directory.
2. Its brief (`integrator-brief.ts`) gives the goal title, every merged and
   conflicting worker's original brief, and the exact conflicted files. The
   rules: edit only those files, remove all markers while keeping both intents,
   create or delete nothing, run no git or shell commands, and end with a short
   rationale.
3. It runs through the normal scheduler, so it gets a durable brief, a lease,
   and one decision card per edit.
4. The agent's `completed` is not trusted. Before committing, the host checks:
   - the merge is still open (`MERGE_HEAD`), so the agent did not commit or
     abort it;
   - no conflict markers remain in the conflicted files;
   - no tracked file outside the conflicted set changed;
   - no untracked file was added.
5. On success the host stages the conflicted files and records a two-parent
   factory merge commit. The agent's final message, read from its
   `acp.events.ndjson`, becomes the recorded `rationale` along with its SHA-256.
   Merging then continues, and later conflicts get their own integrator (up to
   8 per attempt).
6. On any check failure the merge is aborted and the attempt ends `conflicted`,
   with the reason in `detail`. Out-of-scope edits remain in that attempt's
   worktree as evidence.

The composed head is then revalidated like any attempt. Validation policy is
always loaded from the bridge's project root, never from a worktree, so an
integrator cannot weaken its own gate by editing `.et/config.toml`. Integrator
workers are never integration sources, and they don't block later integration
runs. The goal PR body lists every resolution, with the integrator's rationale
quoted, and every exclusion.

`evergreen.integration.status` lists a goal's integration attempts and
validation records from the command API.

## GitHub handoff

A handoff takes a `validated` integration to GitHub in two explicit steps.

### 1. `evergreen.handoff.request`

The bridge verifies the following, then records a plan without contacting
GitHub:

- The integration is `validated`.
- Its worktree is still clean, on its branch, and at its validated head.
- The branch is a factory branch (`<class prefix>et-…`) and not protected.
- The PR base is an allowed base ref.

The plan contains:

- the canonical remote and GitHub repository (from `project_id`);
- the branch, exact head SHA, PR base (the goal's base ref), and title (the
  goal title);
- the PR body's SHA-256 digest and length;
- an optional earlier goal PR to mark as superseded.

The command API stores the plan and creates an `external_side_effect` decision
card in the same transaction. The card lists every external action verbatim.
Only one handoff may exist per integration attempt. Declining the card is
final for that attempt.

The PR body (`handoff-body.ts`) renders the goal, integration attempt, base,
head, aggregate diff stats and digest, sources in merge order with capture
commits, overlapping files, and every validation command with its exit code and
duration. It deliberately omits local filesystem paths. The body text stays in
command state; events and the read model carry only its digest.

### 2. `evergreen.handoff.execute`

After the engineer resolves the card with `approve`, `execute` moves the handoff
to `executing` before any side effect and re-checks policy and the body digest.
It then runs each step, observing GitHub first:

| Step | Observation | Action when not already done |
| --- | --- | --- |
| Push | `git ls-remote` shows the branch at the head SHA. | `git push <remote> <sha>:refs/heads/<branch>`. No force option exists, so a diverged remote branch fails the handoff and is left untouched. |
| Pull request | `gh pr list --head <branch> --state open` finds one. | `gh pr create` with the stored body. |
| Supersede comment | An existing comment on the earlier PR carries `<!-- evergreen-handoff:<id> -->`. | `gh pr comment` with that marker. |

Any step recorded as already done appears in `reconciledSteps`, so a crash
mid-handoff is recovered by running `execute` again, never by replaying blindly.
A failure records `failed` with the error. Re-running `execute` retries the
same approved plan, and nothing outside that plan can be performed. The GitHub
capability (`GitHubPort`) has no merge operation; merging stays with the
engineer. `gh` runs with the engineer's installed authentication. Body and
comment files are preserved under `$ET_FACTORY_ROOT/handoffs/<handoff-id>/`.

## Read-only agent sessions

The mayor, discovery agents, and Jarvis run as ACP sessions that cannot write.
Each gets its own detached checkout (or, for Jarvis, an evidence directory)
under `$ET_FACTORY_ROOT/checkouts/` with no branch, mounted with `--ro-bind`.
`ReadOnlyPermissionResolver` never raises a card: it allows reads inside the
checkout and the same confined read-only commands a worker may run unattended,
and refuses everything else (`via: "policy"`, rule `read_only_session`), so
the agent sees the refusal and carries on.

Agent output is never trusted. `runStructuredSession` extracts the last fenced
JSON block, validates it with the strict Zod contract and the host's own
checks, and on failure sends up to two repair turns in the same session listing
every problem. A session that never produces valid output is recorded as a
failure, not guessed at.

Every Bubblewrap sandbox (workers included) binds the repository's Git common
directory read-only after the private `/tmp`. Without it, a repository under
`/tmp` was invisible to its worktree (`not a git repository`). Git metadata is
read-only for every session; the host makes all factory commits.

## Mayor planning

`evergreen.plan.draft` records intent (`plan.updated: drafting`) before the
mayor session starts. The mayor reads the goal contract (description,
references, constraints), the `.et` capacity and checks, the promoted
preferences, every other active goal's scope claims, and, for a revision, the
previous plan plus the engineer's answers and revision note. It returns:

- a bounded contract (acceptance, out of scope, assumptions);
- one to six tasks (at most `workers.max_per_repository`), each with a unique
  key and role, a self-contained brief, acceptance, `dependsOn`, and a **scope
  claim** listing every file or glob it may change;
- risks by category, validation notes, `integrateAfterGoalIds`;
- or up to four questions, in which case it returns no tasks.

The host rejects, with a repair turn, a cycle, an unknown or self dependency,
duplicate keys or roles, a reserved role (`integration`, `integrator`, `mayor`,
`discovery`), too many tasks, an unknown `integrateAfterGoalIds` entry, and two
tasks whose claims share an existing file without a dependency path between
them. It then records the plan with its cross-goal claim overlaps and the risks
`.et` flags, and creates one `plan_approval` card that restates every task,
scope, dependency, and brief digest (`approve` / `revise` / `reject`). Questions
become `ambiguity` cards instead. Drafting the next revision is refused until
every question is answered; the answers and any revision note are passed to
the mayor verbatim. A draft interrupted by a bridge restart is failed, never
resumed.

`evergreen.plan.launch` moves an approved plan to `launching`, then creates the
workers in dependency order with idempotency keys `plan-<planId>-<taskKey>`
(reusing any already created), records each brief (`plannedWorkerBrief`, which
restates the contract and scope claim), records `launched` with the task-to-
worker map, and starts the schedule. A dependent worker starts from the same
base commit and does not see its prerequisite's changes; the mayor is told so.

The integration train enforces claims: when the goal has a launched plan, a
worker that changed a file outside its claim makes the attempt `blocked`
before anything merges, with `scopeViolations` as evidence. Excluding that
worker (with a rationale) integrates the rest.

## Repository onboarding

`evergreen.onboarding.discover` collects deterministic facts from Git itself
(canonical remote with credentials stripped and SSH aliases resolved through
`ssh -G`, branches, base and HEAD SHAs, default branch, manifests, top-level
layout), then runs two to four discovery agents over disjoint areas (git,
topology, validation, risk, conventions), each in its own read-only checkout
of the base commit. Every finding must cite a file (and line) or the read-only
command used; the host checks each file citation against the base commit and
records the ones it could not verify. The mayor consolidates the reports; every
proposed check and setup step needs cited evidence and every base ref must be
a local branch.

The host, not an agent, writes the policy (`composePolicy`): identity from Git;
capacity, priorities, branch classes, and permissions from the existing policy
or the safe defaults; protection only ever added to; and all seven safety-floor
risk categories always require a card. The TOML is rendered and proven to parse
back to the same policy. One `onboarding` card carries the exact text and its
digest, the evidence, risks, ambiguities, module map, and profile.

`evergreen.onboarding.apply` creates a worktree on
`<class prefix>et-onboarding-<id8>` at the base commit, writes exactly the
approved text, verifies that the commit changes only `.et/config.toml`, and
runs the policy's validation there. Merging it is the engineer's action.

### First-goal gate

`evergreen.goal.submit` now accepts a goal only when `.et/config.toml` is
committed at the base commit, the working copy's policy equals it, and the
canonical remote still identifies `project_id`. Each refusal names its reason.

## Learned preferences

`evergreen.preference.propose` records a preference for the global profile or
this project. Categories are tone, verbosity, runner, workflow,
language_convention, and framework_convention; keys under `policy`,
`permissions`, `risk`, `validation`, `branches`, `workers`, or `goals` are
refused, because policy changes only through `.et` on a factory branch. A
low-impact preference (tone, verbosity, runner, workflow) with at least two
distinct pieces of evidence that does not change a value already held is
promoted at once; anything else becomes a `preference` card, settled in the
same transaction as the card's resolution. A promotion supersedes the previous
value for that key. The mayor sees promoted preferences; Jarvis sees tone and
verbosity only.

## Jarvis

`evergreen.jarvis.ask` writes a fresh evidence directory from the read API (one
JSON file per record kind, scoped to a goal and its events when one is named)
and runs a read-only session whose whole world is that directory. The answer
must cite record IDs that exist in it, list missing evidence, and may propose
up to four actions from a fixed list (`plan.draft`, `plan.launch`,
`schedule.resume`, `validation.run`, `integration.run`, `integration.resolve`,
`handoff.request`) whose arguments are checked against each tool's own input
schema. Approving cards and executing handoffs are deliberately not proposable.
Jarvis performs no action. Question, evidence, transcript, and answer are kept
under `$ET_FACTORY_ROOT/jarvis/<question-id>/`. `ET_JARVIS_ADAPTER` selects its
adapter independently of workers.

The current workspace carries its policy at `.et/config.toml` on the
`feat/create-et` branch. Under the first-goal gate it counts as onboarded only
at a base that contains that commit, so goals based on `main` are refused until
the branch is merged.
