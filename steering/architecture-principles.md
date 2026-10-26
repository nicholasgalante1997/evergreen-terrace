# Architecture Principles

Guiding principles for technical decisions across all projects. Agents making architectural recommendations or generating structural code should reason against these.

## Separation of Concerns

Commands orchestrate. Workers execute. Models represent domain data. These layers don't bleed into each other. A CLI command should not contain business logic — it delegates to a worker or model.

## Narrow Scope

Each module, agent, and service owns one lane. The PM agent doesn't touch code. The voice agent doesn't write tickets. Narrow scope produces predictable output and reduces review overhead.

## Persistence Over Ephemeral State

Prefer a durable, inspectable source of truth over in-memory state for anything
that must survive a session restart. Legacy systems may use Git-backed or
file-backed state. Evergreen v1 uses transactional command state, immutable audit
events, a durable outbox, and replayable projections. If an agent crashes, the
next session observes and reconciles evidence rather than blindly replaying work.

## Explicit Over Implicit

Configuration is explicit (TOML files, typed interfaces). Magic is a liability. If a behavior depends on a convention, document the convention.

## Bun-Native First

When a Bun-native API exists, use it. Don't reach for Node.js equivalents unless there's a specific reason. `Bun.file()`, `Bun.serve()`, `Bun.write()` over `fs`, `http`, `writeFileSync`.

## No Premature Abstraction

Build the thing that's needed. Don't build the framework that could build the thing. Abstractions are earned by repetition — extract when you've written the same pattern three times, not before.

## Observability

Services record what they do. V1 emits versioned domain events, retains command
and artifact provenance, and exposes a projection freshness watermark. Logs are
structured (JSON) in production and human-readable in development. Documentation,
recovery evidence, and decision records are production artifacts.

