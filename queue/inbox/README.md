# Queue Inbox

Work items awaiting delegation. Each item is a TOML file.

## Item Schema

```toml
[item]
id = ""           # UUID
title = ""        # One-line description
project = ""      # Project name from context/projects/
type = ""         # "feature" | "bug" | "research" | "design" | "pm" | "ops"
priority = ""     # "p0" | "p1" | "p2" | "p3"
created = ""      # ISO datetime
source = ""       # "manual" | "sentinel" | "jira" | "gitlab"

[delegation]
agent = ""        # Which agent to delegate to (empty = unassigned)
delegated_at = "" # ISO datetime

[context]
description = ""  # Freeform detail
acceptance = ""   # What done looks like
links = []        # Relevant URLs or file paths
```
