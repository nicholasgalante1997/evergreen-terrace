# Evergreen Terrace v1 operations and recovery

## Implemented local topology

The Compose foundation starts six long-lived local services:

| Service      | Role                                      | Exposure         |
| ------------ | ----------------------------------------- | ---------------- |
| Postgres     | Separate command and read databases/roles | Internal only    |
| Kafka        | Single-node KRaft event broker            | Internal only    |
| command-api  | Goal commands and transactional outbox    | `127.0.0.1:7410` |
| outbox-relay | Committed outbox records to Kafka         | Internal only    |
| projection   | Idempotent Kafka-to-read-model consumer   | Internal only    |
| read-api     | Read-only goal/projection queries         | `127.0.0.1:7440` |

`kafka-init` is a one-shot Compose job that creates the six-partition
`evergreen.events.v1` topic. Named volumes are intentional and are never
removed by normal lifecycle commands.

## Prerequisites

- Bun `1.3.13` or newer
- Docker Engine with Compose v2
- A local `.env` created from `.env.example`

Set unique local values for all four `ET_*_PASSWORD` variables. `.env` is
ignored and must never be committed. The current foundation has no browser,
host bridge, or remote credential requirement.

## Start, inspect, and stop

```bash
bun run factory:up
bun run factory:status
curl --fail http://127.0.0.1:7410/readyz
curl --fail http://127.0.0.1:7440/readyz
bun run factory:logs
```

`factory:status` lists the named factory containers without reading database
passwords from the shell. `factory:down` stops containers but keeps Kafka and
Postgres volumes, event history, and projection state:

```bash
bun run factory:down
```

Stopping is not cleanup. Do not run `docker compose down --volumes` as a normal
operation; volume deletion is a recovery-destructive action and requires an
explicit decision.

## Host bridge operation

Start the native bridge from the target repository after the Compose command API
is healthy. Its default project root is the current directory. Use
`--project-root=/absolute/path` when a harness starts it elsewhere.

```bash
bun run bridge:stdio
bun run bridge:http
```

The HTTP bridge binds only `127.0.0.1:7450`. The stdio bridge reserves stdout
for JSON-RPC; inspect its stderr for lifecycle diagnostics. See
[`HOST_BRIDGE.md`](HOST_BRIDGE.md) for the tool and session contract.

## Normal recovery

1. Inspect `bun run factory:status` and `bun run factory:logs`.
2. Restart the affected service with Compose. Do not delete its volume.
3. Check command and read readiness endpoints.
4. Compare the read-model watermark from `/v1/projection/freshness` with the
   command event being investigated.
5. If the outbox relay was unavailable, leave its unpublished rows intact; it
   resumes publication after Kafka is ready.
6. If the projection was unavailable, it resumes from its consumer group and
   deduplicates by `eventId`.

The system does not retry commands by replaying worker side effects. Future host
bridge recovery must reconcile durable side-effect evidence before resuming a
goal or worker.

## Data ownership and restoration

- Command database: authoritative goal state, immutable events, and outbox.
- Kafka volume: event stream and consumer offsets.
- Read database: rebuildable projection and projection watermark.
- Factory worktree/artifact roots: future host-side evidence, outside containers.

Automated local recovery snapshots are a required later v1 slice and are **not
implemented yet**. Until then, before any operator-directed destructive database
or volume operation, stop and take an explicit local backup under an operator
chosen path. Record its location and source service in a decision record.

Manual snapshot, without role password hashes (`pg_dump` per database, not
`pg_dumpall`):

```sh
dir=~/.local/state/evergreen-terrace/backups/$(date -u +%Y%m%dT%H%M%SZ)-<reason>
mkdir -p "$dir" && chmod 700 "$dir"
for db in evergreen_command evergreen_read; do
  docker exec evergreen-postgres pg_dump -U evergreen_admin --format=custom "$db" > "$dir/$db.dump"
done
chmod 600 "$dir"/*.dump
```

## Rotating database credentials

Postgres role passwords live in the `evergreen-postgres` volume; init scripts
run only on an empty volume. Editing `.env` alone therefore breaks every
service on the next rebuild. Never recreate the volume to "fix" this. Instead,
after editing `.env`, rotate each role in place. This passes each value by
environment-variable name, so it never appears in argv, output, or history:

```sh
envval() { grep -E "^$1=" .env | cut -d= -f2- ; }
rotate() {  # rotate <role> <ENV_KEY>
  ET_ROTATE_PW="$(envval "$2")" docker exec -i -e ET_ROTATE_PW evergreen-postgres \
    psql -U evergreen_admin -d postgres -v ON_ERROR_STOP=1 -q <<SQL
\getenv pw ET_ROTATE_PW
ALTER ROLE "$1" PASSWORD :'pw';
SQL
}
rotate evergreen_command    ET_COMMAND_DATABASE_PASSWORD
rotate evergreen_projection ET_PROJECTION_DATABASE_PASSWORD
rotate evergreen_read_api   ET_READ_API_DATABASE_PASSWORD
rotate evergreen_admin      ET_POSTGRES_ADMIN_PASSWORD
docker compose up --build -d
```

Bun auto-loads `.env` for the host bridge too. Optional settings left empty
(for example `ET_FACTORY_ROOT=`) are treated as unset, and a set
`ET_FACTORY_ROOT` must be absolute.

## Security boundaries

- Only the command and read APIs bind loopback ports.
- Containers have no home-directory mount, host credential store, Git checkout,
  worktree root, or Docker socket.
- The read API uses a distinct database role with only schema usage and table
  `SELECT` grants.
- The command API and outbox relay share the command role because both require
  command-side event/outbox access. Future migrations must preserve least
  privilege or explicitly justify a narrower role split.
- Secrets are environment inputs, never event payloads or log fields.

## Known operational limits

- This is a single-node local Kafka profile, not a high-availability deployment.
- The native host bridge provides stdio and loopback HTTP MCP, governed goal and
  decision commands, explicit remote sync, deterministic worktree creation, and
  one governed ACP worker execution action.
- A worker pauses on durable decision cards for unsafe ACP permissions. The host
  bridge schedules workers from durable briefs under renewable command-API
  leases (see `HOST_BRIDGE.md`, "Durable worker scheduler"). After a bridge
  crash, `evergreen.schedule.resume` reconciles expired leases. Sessions that
  lost liveness are failed, not replayed, so a retry is a new attempt.
- The integration train (`evergreen.integration.run`) composes and revalidates
  a goal locally and records conflicts. It does not resolve conflicts:
  `conflicted` means rework the sources, then run a new attempt. Pushing and
  opening the goal PR go through `evergreen.handoff.request` and
  `evergreen.handoff.execute`, gated by a decision card. The browser console
  and decision-card UI remain later slices, so cards are resolved with
  `evergreen.decision.resolve`.
- Validation needs Bubblewrap with unprivileged network namespaces
  (`bwrap --unshare-net` must work). A project whose checks need dependencies
  must list a dependency install under `[validation] setup`, because fresh
  factory worktrees have no `node_modules`.
- The command API, projection, and read API must be rebuilt together for the
  scheduler, integration, and handoff slices. The new `worker.brief_recorded`,
  `worker.lease_*`, `validation.completed`, `integration.updated`, and
  `handoff.updated` events fail strict validation in an older projection
  consumer.
- **JSONB normalization on upgrade.** Earlier writers stored every JSONB value
  (event envelopes, outbox rows, decision options, and so on) as a JSON
  *string* scalar, because Bun's driver re-encodes text bound to a `::jsonb`
  parameter. Readers parsed both forms, so the application worked, but SQL JSON
  queries saw only strings. Writers now bind `::text::jsonb`. On their next
  start, the command API and projection migrations unwrap existing string rows
  in place (`col = (col #>> '{}')::jsonb`). The rewrite is lossless and
  idempotent, and changes only representation, not event content.
- GitHub handoff uses the installed `gh` CLI and the engineer's Git push
  credentials on the host. It pushes only to the policy's `canonical_remote`.
- The repository-wide test command also builds the legacy Tauri desktop app. On
  Linux it requires system development packages for GDK 3 and Pango; missing
  those packages does not affect the Compose foundation checks.
