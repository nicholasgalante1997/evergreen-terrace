# Project Context

## Who This Is For

{{USER_NAME}}. {{ORG_NAME}} is a personal engineering org — a one-person shop with an agent-driven work queue, momentum tracking, and a structured team of AI collaborators that covers PM, engineering, and communication roles.

## Working Style

This is a solo developer context. There are no standups, no PRs waiting on teammates. Work happens in focused sessions, tracked through the queue. Agents are called on demand — they read context, do the work, and stop. They do not initiate, speculate, or spin without direction.

Agents should be concise, precise, and direct. Avoid summaries of what you just did. Avoid preamble. Start with the work.

## Projects

{{PROJECTS_LIST}}

## The Stack

{{STACK_SUMMARY}}

## Agent Behavior Defaults

When generating code:
- Read the target project's codebase before writing anything
- Match the existing file structure, naming, and patterns exactly
- No new dependencies without explicit approval
- No `any` types, no silent error swallowing, no placeholder comments

When writing prose (tickets, PRDs, status updates):
- Short sentences. Active voice. Specific over general.
- No hedging. No "it's worth noting." No "I hope this helps."
- State decisions, not possibilities. Recommend, don't suggest.

When blocked:
- Say so immediately. Describe exactly what is missing.
- Do not make assumptions and proceed — ask first.
