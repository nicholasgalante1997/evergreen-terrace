# foresight-context

Deep context for the foresight project (`~/dev/foresight`). Read this before working on any task that touches foresight crates or the Tauri widget.

---

## What Foresight Is

Proactive resource management for non-technical enterprise workers. A lightweight agent monitors system resources continuously and acts *before* problems — surfacing plain-language desktop notifications ("Closing a few browser tabs would help right now") rather than reactive IT escalations.

**Two modes:**
- **Quiet Mode (default):** Invisible until it has something actionable. Plain-language nudges at the right moment.
- **Active Mode (Phase 3):** System-tray widget showing human-readable process inventory. Users annotate processes as important/disposable; foresight manages cleanup.

**Target market:** Mid-to-large enterprises, non-technical workers on constrained hardware (financial services, healthcare, legal). Pricing: $2–5/device/month SaaS.

---

## Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Agent, SQLite catalogue, sysinfo collector | ✅ Complete |
| 2 | Analysis engine, baseline learning, Quiet Mode nudges | 🔄 In Progress |
| 3 | Active Mode widget (Tauri), process annotations, managed cleanup | ⬜ |
| 4 | macOS parity, codesigning, notarization | ⬜ |
| 5 | Windows parity | ⬜ |
| 6 | Cloud telemetry, IT admin dashboard | ⬜ |

---

## Repository Structure

```
foresight/
├── crates/
│   ├── foresight-core/     data models, analysis engine (platform-agnostic)
│   ├── foresight-db/       SQLite layer — schema, migrations, all queries
│   └── foresight-agent/    binary — sysinfo collector, polling loop, nudge delivery
├── widget/
│   └── src-tauri/          Tauri tray app — Active Mode (Phase 3)
├── definitions/
│   └── processes.json      human-readable names for 35+ enterprise applications
└── Cargo.toml              workspace manifest
```

---

## Cargo Workspace

All dependencies are declared at workspace level in root `Cargo.toml`. Crates use `dep.workspace = true` for workspace deps.

**Key workspace dependencies:**
```toml
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
thiserror = "2"
anyhow = "1"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "fmt"] }
chrono = { version = "0.4", features = ["serde"] }
sysinfo = "0.34"          # cross-platform telemetry (Linux /proc, macOS libproc, Windows PDH)
rusqlite = { version = "0.32", features = ["bundled"] }  # SQLite, compiled from source
dirs = "5"                # platform-appropriate data directories
```

Edition: 2024.

---

## Crate Responsibilities

### `foresight-core`
Platform-agnostic data models and analysis engine. No I/O, no async — pure domain logic.

```
src/
├── analysis/    analysis engine (Phase 2)
├── error.rs     CoreError (thiserror)
└── models/      data model structs (ProcessSnapshot, SystemSnapshot, etc.)
```

`CoreError` is a `thiserror` enum. Library crate — no `anyhow` here.

### `foresight-db`
SQLite persistence layer. All schema, migrations, and queries live here.

```
src/
├── db.rs        Database struct — opens connection, runs migrations
├── error.rs     DbError (thiserror, wraps rusqlite::Error + CoreError + IoError)
└── queries.rs   all SQL queries as typed functions
```

`Database` is the only public type. All access goes through it.

**DB path:**
- Linux: `~/.local/share/foresight/foresight.db`
- macOS: `~/Library/Application Support/foresight/foresight.db`

**Error pattern:**
```rust
#[derive(Debug, Error)]
pub enum DbError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("core error: {0}")]
    Core(#[from] foresight_core::error::CoreError),
}
```

### `foresight-agent` (binary: `foresight`)
The running agent. Opens the DB, runs idempotent migrations, polls sysinfo every 30s, stores snapshots. Phase 2 adds the analysis pass and nudge delivery.

Application crate — uses `anyhow` for error propagation. Entry point: `src/main.rs`.

**Logging:** `tracing` + `tracing-subscriber` with `RUST_LOG` env var (not `log`/`env_logger`).

**Run:**
```bash
RUST_LOG=info cargo run --bin foresight
```

### `foresight-widget` (Tauri, Phase 3)
Tauri tray app for Active Mode. Not yet implemented. Will wrap a web frontend (TBD) with Rust system calls for process management.

---

## Rust Patterns in This Codebase

### Error handling
- Library crates (`foresight-core`, `foresight-db`): `thiserror` enums, typed errors, `#[from]` for conversions
- Application crates (`foresight-agent`): `anyhow` for ergonomic propagation with `?`
- Never `unwrap()` or `expect()` in non-test code outside of initialization

### Async
- Tokio runtime. `#[tokio::main]` on agent entry point.
- No blocking I/O in async contexts — use `tokio::fs` over `std::fs`

### Serialization
- All model structs derive `Serialize, Deserialize`
- Use `chrono::DateTime<Utc>` for timestamps, with `serde` feature

### Logging
- `tracing::info!()`, `tracing::debug!()`, `tracing::warn!()`, `tracing::error!()`
- Structured fields: `tracing::info!(pid = %pid, name = %name, "collected snapshot")`
- **Not** `println!()` or `log::info!()` in library code

---

## Related Projects

- **`linux-system-monitor`** (`~/dev/linux-system-monitor`) — contributed the sysinfo integration, CPU accuracy pattern, and data model structure to foresight
- **`btop`** (`~/dev/btop`) — contributed the `ProcessRow` shape and UI language for the Active Mode widget design

---

## Key Constraints

- **`foresight-core` has no I/O** — it must remain platform-agnostic and testable without a running system
- **All SQL in `foresight-db`** — no raw SQL in `foresight-agent` or `foresight-core`
- **`sysinfo` is the telemetry abstraction** — do not call platform-specific APIs (procfs, libproc) directly
- **Migrations are idempotent** — the agent runs them on every startup
- **Agent polling interval is 30s** — this is load-tested and intentional; do not change without profiling
