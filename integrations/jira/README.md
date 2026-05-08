# Jira Integration

MCP wrapper for Jira. Used by the PM agent to create, update, and query tickets without Nick touching Jira directly.

## MCP Server

Uses the `@modelcontextprotocol/server-jira` package or the Atlassian-provided MCP server.

### Configuration

Add to your Kiro MCP settings (`.kiro/settings/mcp.json`):

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-jira"],
      "env": {
        "JIRA_URL": "https://charter.atlassian.net",
        "JIRA_EMAIL": "c-nicholas.galante@charter.com",
        "JIRA_API_TOKEN": "<your-api-token>"
      }
    }
  }
}
```

### Getting an API Token

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Create a token named "kiro-evergreen-terrace"
3. Store it in `.env` at the repo root as `JIRA_API_TOKEN`

## Available Tools

Once configured, agents have access to:

- `jira_create_issue` — Create a new ticket
- `jira_update_issue` — Update an existing ticket
- `jira_get_issue` — Get ticket details
- `jira_search_issues` — JQL search
- `jira_add_comment` — Add a comment
- `jira_transition_issue` — Move ticket through workflow states

## PM Agent Usage

The PM agent uses Jira to:

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

## Environment Variables

Add to `.env`:

```
JIRA_URL=https://charter.atlassian.net
JIRA_EMAIL=c-nicholas.galante@charter.com
JIRA_API_TOKEN=
JIRA_PROJECT_KEY=
```
