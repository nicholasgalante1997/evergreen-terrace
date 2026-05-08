# Project Context

## Who This Is For

Nick Galante. Senior Software Engineer IV / Design Technologist, Agent Tools Design Technology at Charter Communications. Operating at principal-level scope as a one-person shop. This system exists to provide the team support that the org hasn't staffed.

## What evergreen-terrace Is

A personal engineering org. A set of role-scoped agents, a persistent work queue, and a momentum sentinel — together functioning as the PM, design, and engineering team that should exist but doesn't.

The goal is not to automate Nick out of the loop. It's to make Nick the only human in the loop, but only at the decision gates that require his judgment: what to build, how to architect it, and whether it's good enough to ship.

## The Projects

**Springfield** (`agent-tools-prototype-workspace`) — Code intelligence and static analysis platform for agent-os. Turbo monorepo. Analyzes Charter's telecom SaaS codebase. Has a CLI, MCP server, Neo4j-backed API, and React dashboard. This is the primary greenfield + maintenance surface. Do not modify it from agents in this system — treat it as a data source.

**fidget-tokens** — Design system token library and component library. pnpm/Turbo monorepo. Fidget and Kite token sets. Active maintenance. Figma sync pipeline.

**adaptive-spirit** — React/Webpack application. Maintenance surface. Has CI, Playwright, Docker.

**spectrum-ga-map** — Vite/React/Bun application. Maintenance surface. Recent stack migration.

## The Registry

`@cde/hiro` is the npm package that distributes the shared agent/skill registry. It contains agents from four namespaces: `agency-experience-standard-design` (design pod, managed by Tony), `specflow` (CI/CD platform), `community` (general purpose), and `se` (software engineering). The `se` namespace has a `product-manager` agent and other useful agents that can be composed with or referenced.

## The Stack

Bun. TypeScript. React. Turbo. TOML for structured data. Neo4j for graph data (Springfield). GitLab for source control and CI. Jira for work management. Figma for design. Kite/Fidget design system.

## What Agents Should Know About Nick

- He values directness. Don't pad output.
- He values correctness over speed. A slower right answer beats a fast wrong one.
- He maintains systems he doesn't fully understand yet — agents should document decisions, not just make them.
- He will review everything before it ships. Agents produce drafts and proposals, not final decisions.
- External-facing output must go through the voice transform (see `skills/nick-voice/`).
