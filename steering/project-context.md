# Project Context

## Who This Is For

Nick Galante. Principal-level engineer operating as a one-person shop on personal OSS projects. Professional workload has grown significantly, leaving little bandwidth for OSS context-switching. evergreen-terrace exists to fill the gap — providing the PM, engineering team, and momentum tracking that a full team would otherwise supply.

## What evergreen-terrace Is

A personal engineering org. Role-scoped agents, a persistent work queue, and a momentum sentinel — together functioning as the PM, design, and engineering team that doesn't otherwise exist.

The goal is not to automate Nick out of the loop. It's to make Nick the only human in the loop, but only at decision gates that require his judgment: what to build, how to architect it, and whether it's good enough to ship.

## The Projects

### Production / Active Development

**deckvault** (`~/dev/.Project-Johto/Pokemon`) — Competitive Pokémon TCG platform. P0. Production running on this machine: DGX Spark → Cloudflare Tunnel → deckvault.gg. Full-stack Turbo monorepo: React 19 SSR (Bun), REST API (Bun/PG), GraphQL (Apollo/Bun + Rust/axum), cron, MCP server (Rust), scripts. See `context/projects/deckvault.toml`.

**arcturus-jr** (`~/dev/.Project-Arcturus/Arcturus-JR`) — Personal technical blog. P1. React 19 SSR, Bun, Turbo. "Void" design system (jet-black, five vivid accents, rose hover invariant). Active published content. Uses loclaude for local LLM. See `context/projects/arcturus-jr.toml`.

**agartha** (`~/dev/.Agartha`) — Bare-metal Rust OS. P1. "An operating system that is itself a cryptographic easter egg." x86-64, UEFI, Limine bootloader. No-std Rust (nightly). Two-model workflow: Claude (architecture/specs) + Nemotron local GPU (kernel boilerplate). Has agartha.iso. See `context/projects/agartha.toml`. **CRITICAL: never start llama-server --ctx-size above 262144.**

**bundt** (`~/dev/bundt`) — OSS tooling platform. P1. Bun/TypeScript/Turbo monorepo under `@bundt/*`. Active: `@bundt/prev` (agent-native React SSR, v0.3.0), `@bundt/cleo` (Claude extensions orchestrator). See `skills/bundt-context/` for deep context.

**foresight** (`~/dev/foresight`) — Rust/Tauri proactive resource management tool. P1. Phase 2 in progress (analysis engine + Quiet Mode nudges). See `skills/foresight-context/` for deep context.

**monologues** (`~/dev/.Monologues`) — Web app with auth + casts database. P2. Turbo monorepo, Docker. Most recently touched project (May 7). Full architecture needs exploration.

### Tooling / Infrastructure

**evergreen-terrace** (this repo) — Personal engineering org platform. Phase 4 in progress.

**nix-rails** (`~/dev/.Project-NixRails/nix-rails`) — Scaffolding engine for Bun Turborepo workspaces. Phase 1 MVP complete, Phase 2 next.

**bit-context-protocol** (`~/dev/.RFCs/bit-context-protocol`) — BCP binary format reference impl. Token-efficient LLM context serialization. Used by `@bundt/cleo`.

**nemotron** (`~/dev/nemotron`) — Local LLM tooling. MCP server wrapping Nemotron-3-Nano-30B llama-server on this machine's GPU.

**btop** (`~/dev/btop`) — Bun TUI system monitor. CPU, memory, GPU, processes.

**linux-system-monitor** (`~/dev/linux-system-monitor`) — Rust/Actix-web system monitor. Foundational sysinfo work that fed into foresight.

### Research / Exploratory

**gpui-ergonomics** (`~/dev/gpui-ergonomics`) — Rust research with GPUI (Zed's UI framework). Crates: gpui-query, gpui-rsx. No releases.

**pgz** (`~/dev/.Project-South-Park/pgz`) — Rust CLI for local Ollama-based coding assistance.

**anti-react** (`~/dev/.Project-Anti-React`) — Vanilla/alternative UI framework experiment.

**nodext4** (`~/dev/.Project-Bun-Ext4-Filesystem/nodext4`) — JS implementation of Linux ext4 filesystem spec.

**experiments** (`~/dev/experiments`) — Prototype apps for bundt packages.

**sleepy-dogs** (`~/dev/experiments/sleepy-dogs`) — Published npm package. Zero-dependency JS utility library.

**zed** (`~/dev/zed`) — Upstream Zed editor clone. Read-only reference for GPUI internals.

## The Stack

**TypeScript:** Bun runtime. Turbo for monorepo orchestration. React 19 for UI. Vite or Bun.build() for bundling.
**Rust:** Tokio async. Actix-web (if HTTP). thiserror + anyhow for errors. tracing for logging. serde for serialization. Tauri for desktop.
**Persistence:** TOML for structured config, SQLite (rusqlite) for relational data, flat files for append-only logs.
**Source control:** Git. GitHub for public OSS repos. Independent semver per package.

## What Agents Should Know About Nick

- He values directness. Don't pad output.
- He values correctness over speed. A slower right answer beats a fast wrong one.
- He maintains systems he doesn't fully understand yet — agents should document decisions, not just make them.
- He will review everything before it ships. Agents produce drafts and proposals, not final decisions.
- External-facing output must go through the voice transform (see `skills/nick-voice/`).
