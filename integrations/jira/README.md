# Jira integration (archived)

The legacy integration guide is intentionally inactive. Evergreen Terrace v1
does not run external MCP server packages or expose unattended third-party
credentials to workers. A future Jira capability must be a governed,
first-party tool implemented behind the host bridge and the decision policy.

## Previously proposed tools

The following domain operations are candidates for a future first-party
integration:

- `jira_create_issue` — Create a new ticket
- `jira_update_issue` — Update an existing ticket
- `jira_get_issue` — Get ticket details
- `jira_search_issues` — JQL search
- `jira_add_comment` — Add a comment
- `jira_transition_issue` — Move ticket through workflow states

## Future usage constraints

Any future Jira tool must use an explicit credential capability and record the
external side effect before it runs. It may:

1. **Create tickets from PRDs** — After producing a PRD, it creates Jira tickets for each work item
2. **Query the backlog** — Reads open tickets to inform prioritization
3. **Update ticket status** — Marks tickets in-progress or done as work moves through the queue

### Ticket Creation Pattern

```
Project: [JIRA_PROJECT_KEY from .env]
Issue Type: Story (features), Bug (bugs), Task (ops/research)
Priority: Highest (p0), High (p1), Medium (p2), Low (p3)
Labels: evergreen-terrace, [project-name]
```
