# Spec: core/web — Metrics Views

## Purpose

Extend the existing web dashboard with metrics views. New tab/section alongside the queue view. Reads from `core/metrics` HTTP API.

## New Routes

Add client-side routing (React Router or hash-based) with two top-level views:

- `/` — existing queue view (inbox + active)
- `/metrics` — new metrics view

Navigation: two tabs in the header — "Queue" and "Metrics".

## Metrics View Layout

Three sections, stacked vertically:

### 1. Queue Velocity

Line chart — items created, delegated, and completed per day over the last 30 days.

- X axis: date
- Y axis: count
- Three lines: created (blue), delegated (yellow), completed (green)
- Data source: `GET /metrics/queue/velocity`

Use `recharts` — already in the web package's dependency tree via the Springfield web app reference. If not present, add it.

### 2. Project Health History

One sparkline per project — sentinel score over the last 10 runs.

- Each sparkline labeled with project name and current score
- Color: green (≥75), yellow (50–74), red (<50)
- Data source: `GET /metrics/sentinel/history`

### 3. Work Item Age Distribution

Bar chart — how long items sit in inbox before delegation, bucketed:
- Same day
- 1–3 days
- 4–7 days
- 7+ days

Data source: derived from `GET /metrics/queue` (created vs delegated timestamps).

## New Hook

`src/hooks/useMetrics.ts` — fetches from metrics service, same pattern as `useQueue`:

```ts
export function useMetrics(pollMs = 0): UseMetricsResult
```

Metrics service URL: relative `/metrics/*` — add to Vite proxy config:

```ts
proxy: {
  "/queue": { target: `http://localhost:${config.queue.server.port}` },
  "/metrics": { target: `http://localhost:${config.metrics.server.port}` },
}
```

## Component Structure

```
src/
├── views/
│   ├── QueueView.tsx          # Existing queue content extracted here
│   └── MetricsView.tsx        # New metrics content
├── components/
│   ├── QueueItem.tsx          # Existing
│   ├── Section.tsx            # Existing
│   ├── VelocityChart.tsx      # New
│   ├── HealthSparkline.tsx    # New
│   └── AgeDistribution.tsx    # New
└── hooks/
    ├── useQueue.ts            # Existing
    └── useMetrics.ts          # New
```

`App.tsx` becomes a shell with tab navigation and route rendering.

## Acceptance Criteria

- Tab navigation between Queue and Metrics views works
- Velocity chart renders with correct data from metrics API
- Health sparklines render per project with correct color coding
- Age distribution chart renders correctly
- Metrics view shows "metrics service unreachable" gracefully when `core/metrics` is not running
- Vite proxy routes `/metrics/*` to metrics service
- All new components follow existing CSS class pattern (no inline styles)
