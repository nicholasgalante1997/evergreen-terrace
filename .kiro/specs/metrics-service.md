# Spec: core/metrics

## Purpose

Lightweight append-only metrics collection service. Records events from the queue server and sentinel, persists them to `context/metrics/`, and exposes a read API for the dashboard.

## Package

`@evergreen-terrace/metrics` at `core/metrics/`

Follows the same build pipeline pattern as `core/queue-server`:
- `build/base.ts` — `createBaseConfig` with externals
- `build/index.ts` — `concurrent_build`, bun target, `dist/index.js`
- `tsconfig.json` — extends `@evergreen-terrace/config/typescript/bun.tsconfig.json`
- `package.json` — `build`, `dev`, `typecheck`, `clean` scripts

## Persistence

Append-only TOML log files in `context/metrics/`:

```
context/metrics/
├── queue.toml        # Queue throughput events
├── sentinel.toml     # Sentinel run history
└── agents.toml       # Agent invocation events (future)
```

### Queue event schema

```toml
[[events]]
ts = "2026-05-08T10:00:00.000Z"
type = "item_created"        # item_created | item_delegated | item_completed
item_id = "abc-001"
project = "springfield"
priority = "p1"
agent = ""                   # populated on delegated/completed

[[events]]
ts = "2026-05-08T10:05:00.000Z"
type = "item_delegated"
item_id = "abc-001"
project = "springfield"
priority = "p1"
agent = "eng-mid"
```

### Sentinel run schema

```toml
[[runs]]
ts = "2026-05-08T08:00:00.000Z"
mode = "on-demand"           # on-demand | cron
scores = { springfield = 85, "fidget-tokens" = 70, "adaptive-spirit" = 45, "spectrum-ga-map" = 60 }
overall = "at-risk"          # healthy | at-risk | stale
```

## HTTP API

Runs on port `2729`. Exposes read-only endpoints consumed by the web dashboard.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/metrics/queue` | All queue events |
| `GET` | `/metrics/queue/velocity` | Items created vs completed per day (last 30 days) |
| `GET` | `/metrics/sentinel` | All sentinel runs |
| `GET` | `/metrics/sentinel/history` | Score history per project (last 10 runs) |

### Velocity response shape

```ts
interface VelocityPoint {
  date: string;       // ISO date (YYYY-MM-DD)
  created: number;
  delegated: number;
  completed: number;
}
```

### Sentinel history response shape

```ts
interface SentinelHistory {
  project: string;
  runs: Array<{ ts: string; score: number }>;
}
```

## Integration with queue-server

The queue server emits metric events by calling `POST /metrics/event` on the metrics service after each state-changing operation (item created, delegated). Fire-and-forget — queue server does not wait for metrics response and does not fail if metrics is unreachable.

## Config additions to @evergreen-terrace/common

```ts
metrics: {
  server: { port: 2729 },
}
```

## Acceptance Criteria

- `bun run metrics` starts the service on port 2729
- Queue events are appended to `context/metrics/queue.toml` on each queue mutation
- Sentinel runs are appended to `context/metrics/sentinel.toml` after each sentinel run
- `GET /metrics/queue/velocity` returns correct daily counts for the last 30 days
- `GET /metrics/sentinel/history` returns per-project score arrays
- Service is unreachable-tolerant — queue server continues normally if metrics is down
- Build pipeline produces `dist/index.js` via `Bun.build()`
