# Context Schema

Each project gets a TOML file under `context/projects/`. The momentum-sentinel reads these to score project health.

## Fields

```toml
[project]
name = ""           # Human-readable name
repo = ""           # Path on disk
gitlab_url = ""     # GitLab project URL (optional)
description = ""    # One-line summary of what this is

[status]
priority = ""       # "p0" | "p1" | "p2" | "p3" — manual override
phase = ""          # "greenfield" | "maintenance" | "active-feature" | "stale"
last_touched = ""   # ISO date — updated manually or by sentinel
health = ""         # "healthy" | "at-risk" | "stale" — computed by sentinel

[open_work]
jira_project = ""   # Jira project key (optional)
open_items = 0      # Count of open tickets/tasks
blocked = false     # Whether work is externally blocked
blocker_note = ""   # What's blocking (optional)

[notes]
context = ""        # Freeform — what's the current state, what matters
next_action = ""    # The single most important next thing
```

## global.toml

Tracks cross-project priority ordering and sentinel run history.

```toml
[sentinel]
last_run = ""       # ISO datetime of last sentinel run
mode = "on-demand"  # "on-demand" | "cron"

[[priority_order]]
project = ""        # project name
rank = 0            # 1 = highest
manual_override = false
```
