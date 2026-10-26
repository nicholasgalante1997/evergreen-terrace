# Evergreen Terrace v1 decisions

| ID | Decision |
| --- | --- |
| ET-001 | Build a local-first, additive service system; do not extend legacy conductor semantics. |
| ET-002 | Run Compose-managed services with a host-side privileged bridge. Kubernetes is out of scope. |
| ET-003 | Use Postgres command state plus a transactional outbox to Apache Kafka; projections are read-only. |
| ET-004 | Use one Postgres service with separate command/read databases, roles, and schemas. |
| ET-005 | Use versioned JSON Kafka events validated by shared Zod and JSON Schema contracts. |
| ET-006 | Support Claude Code and Codex over ACP and existing plan authentication. |
| ET-007 | Use a hand-rolled MCP server with stdio and HTTP transports; do not add an external MCP SDK dependency. |
| ET-008 | Require worktrees for all writer agents and preserve the engineer's active checkout. |
| ET-009 | Require `.et/config.toml`, default canonical remote `origin`, strict Zod validation, and no implicit fetch at goal launch. |
| ET-010 | Allow four concurrent goals and three to six workers per repository, with explicit `.et` priority classes. |
| ET-011 | Support concurrent goals in one repository with dependency graphing and a local integration train. |
| ET-012 | Produce one feature branch/PR per goal and shared integration-train evidence; the engineer reviews/merges PRs. |
| ET-013 | Permit autonomous GitHub `gh` activity on allowed factory branches, but never protected-branch merges. |
| ET-014 | Require decision cards for destructive, migration, dependency/security, release, credential, and external-side-effect actions. |
| ET-015 | Ship a full React console plus Jarvis, a separately configurable, read-only console agent. |
| ET-016 | Preserve all evidence in v1 and create local recovery snapshots; cleanup is post-v1. |
| ET-017 | Treat documentation as a verified completion contract. |
