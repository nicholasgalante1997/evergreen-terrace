---
name: rust
description: Rust workspace conventions with Actix-web, Tokio, sqlx, tracing, serde, thiserror, and anyhow
tags: [rust, actix-web, tokio, sqlx, tracing, serde]
---

# Rust / Actix-web / Tokio Conventions

## Priority

**Critical**

## Instructions

**NEVER** use `unwrap()` or `expect()` on `Option` or `Result` in production code paths — propagate errors with `?` (ID: RUST-001)

**ALWAYS** use `thiserror` for library crate errors and `anyhow` for application crate errors (ID: RUST-002)

**ALWAYS** add `.context("what operation failed")` at callsites when using `anyhow::Result` (ID: RUST-003)

**ALWAYS** prefer `&str` over `String` in function parameters when ownership is not needed (ID: RUST-004)

**ALWAYS** use `impl Trait` in argument position for generic flexibility without type parameters (ID: RUST-005)

**NEVER** use `println!()` or `log::info!()` in library code — use `tracing` with structured fields (ID: RUST-006)

**NEVER** use `std::fs` blocking I/O inside an `async` function — use `tokio::fs` (ID: RUST-007)

**ALWAYS** declare shared dependencies at `[workspace.dependencies]` in the root `Cargo.toml` and reference with `.workspace = true` in crate manifests (ID: RUST-008)

**ALWAYS** enable `#![warn(clippy::pedantic)]` in all crates — suppress individual lints with `#[allow(...)]` and a comment explaining why (ID: RUST-009)

**ALWAYS** derive `serde::Serialize, serde::Deserialize` on all persisted model structs (ID: RUST-010)

**ALWAYS** use `sqlx::query_as!` macro for compile-time verified queries — never string interpolation in SQL (ID: RUST-011)

**NEVER** use a bare `PgPool::connect()` — always use `PgPoolOptions` with `max_connections` and `acquire_timeout` set (ID: RUST-012)

**ALWAYS** use `tokio::try_join!` for concurrent independent async operations instead of sequential awaiting (ID: RUST-013)

**NEVER** clone a value to satisfy the borrow checker without understanding ownership first — cloning is not a fix, it's a symptom (ID: RUST-014)

### Ownership and Borrowing

Prefer references in function signatures:

```rust
// CORRECT — borrows the string, no allocation needed
fn process(name: &str) -> String {
    format!("Hello, {name}")
}

// WRONG — takes ownership unnecessarily
fn process(name: String) -> String {
    format!("Hello, {name}")
}
```

Use `impl Trait` for argument flexibility:

```rust
// Accepts &str, String, Arc<str>, Cow<str>, or anything that implements AsRef<str>
fn log_event(msg: impl AsRef<str>) {
    tracing::info!(message = msg.as_ref());
}

// Accepts any iterator of items implementing Display
fn format_list(items: impl Iterator<Item = impl std::fmt::Display>) -> String {
    items.map(|i| i.to_string()).collect::<Vec<_>>().join(", ")
}
```

### Error Handling

Library crate (typed errors with `thiserror`):

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum QueueError {
    #[error("queue item not found: {id}")]
    NotFound { id: String },

    #[error("queue is at capacity ({max} items)")]
    AtCapacity { max: usize },

    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

// Library functions return typed Result
pub fn dequeue(id: &str) -> Result<QueueItem, QueueError> {
    // ...
}
```

Application crate (anyhow with context):

```rust
use anyhow::{Context, Result};

async fn load_config(path: &str) -> Result<Config> {
    let content = tokio::fs::read_to_string(path)
        .await
        .with_context(|| format!("failed to read config file: {path}"))?;

    serde_toml::from_str(&content)
        .with_context(|| format!("failed to parse TOML from {path}"))
}
```

### Async with Tokio

Binary entry point:

```rust
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let config = load_config("config.toml").await?;
    let pool = build_pool(&config.database_url).await?;

    run_server(pool, config.port).await
}
```

Concurrent independent operations:

```rust
use tokio::try_join;

async fn load_dashboard_data(pool: &PgPool, user_id: i64) -> anyhow::Result<DashboardData> {
    let (projects, metrics, queue_stats) = try_join!(
        fetch_projects(pool, user_id),
        fetch_metrics(pool, user_id),
        fetch_queue_stats(pool, user_id),
    )?;

    Ok(DashboardData { projects, metrics, queue_stats })
}
```

### Tracing (Structured Logging)

```rust
use tracing::{info, warn, error, instrument};

#[instrument(skip(pool), fields(item_id = %id))]
async fn process_queue_item(pool: &PgPool, id: &str) -> anyhow::Result<()> {
    info!("processing queue item");

    let item = fetch_item(pool, id).await
        .with_context(|| format!("failed to fetch item {id}"))?;

    if item.is_stale() {
        warn!(age_days = item.age_days(), "item is stale, skipping");
        return Ok(());
    }

    // do work...
    info!(elapsed_ms = elapsed.as_millis(), "item processed");
    Ok(())
}
```

Never use `println!()` or `eprintln!()` in library or production application code. Use `tracing::info!`, `tracing::warn!`, `tracing::error!`.

### Serialization with Serde

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntry {
    pub id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}
```

`Cargo.toml` for chrono with serde:
```toml
[dependencies]
chrono = { workspace = true, features = ["serde"] }
```

### Actix-web Patterns

Handler signature and state extraction:

```rust
use actix_web::{web, HttpResponse, Result as ActixResult};
use sqlx::PgPool;

pub async fn get_project(
    pool: web::Data<PgPool>,
    path: web::Path<String>,
) -> ActixResult<HttpResponse> {
    let id = path.into_inner();

    let project = sqlx::query_as!(
        ProjectRow,
        r#"SELECT id, name, description, created_at FROM projects WHERE id = $1"#,
        id
    )
    .fetch_optional(pool.get_ref())
    .await
    .map_err(|e| actix_web::error::ErrorInternalServerError(e))?;

    match project {
        Some(row) => Ok(HttpResponse::Ok().json(row)),
        None => Ok(HttpResponse::NotFound().finish()),
    }
}
```

App assembly:

```rust
HttpServer::new(move || {
    App::new()
        .app_data(web::Data::new(pool.clone()))
        .service(
            web::scope("/api/v1")
                .route("/projects", web::get().to(get_projects))
                .route("/projects/{id}", web::get().to(get_project))
                .route("/projects", web::post().to(create_project)),
        )
        .route("/health", web::get().to(|| async { HttpResponse::Ok().json(serde_json::json!({"ok": true})) }))
})
.bind(("0.0.0.0", port))?
.run()
.await?;
```

### Workspace Configuration

Root `Cargo.toml`:
```toml
[workspace]
members = ["crates/*", "bin/*"]
resolver = "2"

[workspace.dependencies]
actix-web = "4.9"
anyhow = "1"
chrono = { version = "0.4", default-features = false, features = ["clock"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sqlx = { version = "0.8", features = ["postgres", "runtime-tokio-native-tls", "chrono", "uuid"] }
thiserror = "2"
tokio = { version = "1", features = ["full"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
uuid = { version = "1", features = ["v4", "serde"] }
```

Member crate `Cargo.toml`:
```toml
[package]
name = "my-crate"
version.workspace = true
edition.workspace = true

[dependencies]
actix-web.workspace = true
anyhow.workspace = true
serde = { workspace = true, features = ["derive"] }
sqlx.workspace = true
tokio.workspace = true
tracing.workspace = true
```

## Common Mistakes

- **Using `unwrap()` in a handler or service function**: If the value is `None` or `Err`, the thread panics and Actix logs an unstructured error. Always propagate with `?` and handle at the top level.
- **Using `std::fs::read_to_string` inside an `async fn`**: This blocks the Tokio thread. Use `tokio::fs::read_to_string` which returns a `Future` and does not block.
- **Putting `println!()` calls in library code**: `println!` writes to stdout without structure, bypasses the tracing system, and is invisible to log aggregators. Use `tracing::info!` or `tracing::debug!`.
- **Cloning to satisfy the borrow checker**: If you're cloning to pass a value to two functions, you likely have a design issue. Restructure to pass references, or explain ownership explicitly before deciding to clone.
- **String interpolation in SQL queries**: SQL injection risk and no compile-time verification. Always use `sqlx::query_as!` with `$1`, `$2` parameter placeholders.
- **Declaring the same dependency version in multiple crate manifests**: Leads to version drift. Declare once in `[workspace.dependencies]`, reference with `.workspace = true` in each crate.
- **Missing `anyhow::Context` on error sites**: Bare `?` propagation loses context. `.with_context(|| "what failed")` preserves the error chain and makes debugging tractable.
