# Architecture Principles

Guiding principles for technical decisions across all projects. Agents making architectural recommendations or generating structural code should reason against these.

## Separation of Concerns

Commands orchestrate. Workers execute. Models represent domain data. These layers don't bleed into each other. A CLI command should not contain business logic — it delegates to a worker or model.

## Narrow Scope

Each module, agent, and service owns one lane. The PM agent doesn't touch code. The voice agent doesn't write tickets. Narrow scope produces predictable output and reduces review overhead.

## Persistence Over Ephemeral State

Prefer Git-backed or file-backed state over in-memory state for anything that needs to survive a session restart. This is the Beads principle from Gastown — if an agent crashes, the next session picks up where it left off.

## Explicit Over Implicit

Configuration is explicit (TOML files, typed interfaces). Magic is a liability. If a behavior depends on a convention, document the convention.

## Bun-Native First

When a Bun-native API exists, use it. Don't reach for Node.js equivalents unless there's a specific reason. `Bun.file()`, `Bun.serve()`, `Bun.write()` over `fs`, `http`, `writeFileSync`.

## No Premature Abstraction

Build the thing that's needed. Don't build the framework that could build the thing. Abstractions are earned by repetition — extract when you've written the same pattern three times, not before.

## Observability

Services log what they do. The queue server logs every state transition. The sentinel logs its scoring rationale. Logs are structured (JSON) in production, human-readable in development.

## Springfield is Off-Limits

The Springfield platform (`agent-tools-prototype-workspace`) is not modified by agents in this system. It is a data source and an MCP server. Agents may read from it and call its MCP tools. They do not write to it.
