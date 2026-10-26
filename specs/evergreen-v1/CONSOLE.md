# Evergreen Terrace v1 console and Jarvis

## Boundary

The console (`services/console`) is a native Bun process bound to
`127.0.0.1:7460`. It has two dependencies:

- **Reads** come only from the read API. The browser never sees command state,
  database connections, or bridge credentials.
- **Actions** go only through the host bridge's governed MCP tools, called by the
  console server (`BridgeClient`, one short MCP session per action). The browser
  talks only to the console's same-origin `/api/*` routes.

Every request must name `127.0.0.1:7460` or `localhost:7460` as its Host
(defeating DNS rebinding). Every non-GET request must also come from the
console's own Origin, be JSON, and carry `x-evergreen-console: 1` (defeating
cross-site requests). The page is served with `default-src 'self'`.

## Routes

| Route | Behavior |
| --- | --- |
| `GET /` and `GET /assets/app.(js|css)` | The React shell, built by `bun run --cwd services/console build`. |
| `GET /api/snapshot` | Goals, plans, workers, decisions, validations, integrations, handoffs, onboardings, preferences, the last 100 events, and the projection watermark, read in one pass. |
| `GET /api/events` | Server-sent events: `freshness` whenever the projection watermark moves (the page then refetches), `unavailable` when the read API cannot be reached, and a heartbeat. |
| `POST /api/decisions/:id/resolve` | `{ status, selectedOptionId, note }`, forwarded to `evergreen.decision.resolve`. The card's own rules apply. |
| `POST /api/jarvis` | `{ question, goalId }`, forwarded to `evergreen.jarvis.ask`. |
| `POST /api/actions` | `{ tool, arguments }` for the tools Jarvis may propose only; anything else is refused before reaching the bridge. |

## Shell

The layout is fixed; nothing rearranges it.

- **Top bar:** project filter and the read-model watermark ("last event applied
  Ns ago"), so the page never implies real-time certainty.
- **Goals:** each goal with its latest plan status.
- **Waiting on you:** every pending card across goals, oldest first, with its
  full context, its options, and a note field.
- **Goal panel:** the goal contract and mayor plan (acceptance, out of scope,
  risks, cross-goal overlaps); a dependency graph of the planned tasks (each
  showing its launched worker's state) that runs left to right through the
  latest integration attempt to the handoff; workers; every integration attempt
  with merge evidence, scope violations, integrator rationale, exclusions, and
  per-command validation results; the handoff and PR; and the goal's cards.
- **Right rail:** Jarvis and the event stream.

Diffs are summarized as file and line counts, with each patch's path and digest
kept in the integration record. Cost is not shown: workers use plan
authentication, which reports no per-session cost.

## Jarvis

Jarvis is a separately configured, read-only console agent
(`ET_JARVIS_ADAPTER`, default `claude`). The engineer invokes it explicitly,
through the panel's call-to-action buttons ("Explain this goal" or "What needs
my attention?") or a free question.

Its safety boundary is enforced by the bridge, not by its prompt:

1. The host writes a fresh evidence directory from the read API, scoped to the
   selected goal and its events when there is one. Jarvis runs in a read-only
   sandbox over exactly that directory.
2. Every claim must cite record IDs present in that directory. Proposed
   arguments must match the target tool's input schema. A violation gets a
   repair turn, never a pass.
3. Jarvis can propose only `plan.draft`, `plan.launch`, `schedule.resume`,
   `validation.run`, `integration.run`, `integration.resolve`, and
   `handoff.request`, and runs none of them. A proposal runs only when the
   engineer clicks it, through the same tool and policy as any client. It cannot
   approve a card or execute a handoff.
4. The answer states its confidence per claim and lists missing evidence. No
   hidden reasoning is presented as evidence. The question, evidence,
   transcript, and answer are kept under `$ET_FACTORY_ROOT/jarvis/<question-id>/`.

Not implemented: the spec's temporary investigation workspaces composed from a
static panel and data-source registry. Jarvis answers in its panel only.
