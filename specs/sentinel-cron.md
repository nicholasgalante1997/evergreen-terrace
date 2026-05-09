# Spec: core/sentinel

## Purpose

Cron runner for the momentum sentinel. Reads the schedule from `context/global.toml`, invokes the sentinel agent via Claude Code on schedule, writes the report to `context/reports/`, and notifies the metrics service.

## Package

`@evergreen-terrace/sentinel` at `core/sentinel/`

Same build pipeline pattern as other `core/` packages.

## Config

`context/global.toml` gains a `cron_schedule` field:

```toml
[sentinel]
last_run = ""
mode = "on-demand"           # "on-demand" | "cron"
cron_schedule = "0 8 * * 1-5"  # 8am weekdays — only used when mode = "cron"
```

The runner reads `mode` on startup. If `mode = "on-demand"`, it exits immediately (no-op). If `mode = "cron"`, it parses `cron_schedule` and runs on that schedule.

## Behavior

On each scheduled tick:

1. Assemble the momentum-sentinel system prompt (AGENT.md + skills + steering)
2. Invoke `claude -p "{prompt}" --system-prompt "{assembled}" --model claude-sonnet-4-6 --allowedTools "Read,Write,Bash,Grep,Glob"` as a subprocess
3. Capture stdout (the sentinel report)
4. Write report to `context/reports/sentinel-{YYYY-MM-DD}.md`
5. `POST /metrics/event` to the metrics service with the sentinel run result (fire-and-forget)
6. Update `context/global.toml` — set `sentinel.last_run` to current ISO datetime

## Report persistence

```
context/reports/
└── sentinel-2026-05-08.md    # One file per run date (overwrites same-day runs)
```

## HTTP API

Minimal — exposes the latest report for the queue server to serve.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sentinel/latest` | Latest report markdown |
| `GET` | `/sentinel/status` | `{ last_run, mode, next_run }` |

Runs on port `2730`.

## Config additions to @evergreen-terrace/common

```ts
sentinel: {
  server: { port: 2730 },
}
```

## Cron parsing

Use Bun's built-in `Bun.cron` if available, otherwise a minimal cron expression parser. No external cron library dependency.

## Acceptance Criteria

- When `mode = "on-demand"`, `bun run sentinel` exits with code 0 immediately
- When `mode = "cron"`, process stays alive and fires on schedule
- Report is written to `context/reports/sentinel-{date}.md` after each run
- `GET /sentinel/latest` returns the most recent report
- Metrics service is notified after each run (fire-and-forget, non-blocking)
- Build pipeline produces `dist/index.js` via `Bun.build()`
