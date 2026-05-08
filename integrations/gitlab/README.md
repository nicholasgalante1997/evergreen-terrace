# GitLab Integration

MCP wrapper for GitLab. Used by engineering agents to create MRs, check pipeline status, and query repository state.

## MCP Server

Uses the GitLab-provided MCP server or community equivalent.

### Configuration

Add to your Kiro MCP settings (`.kiro/settings/mcp.json`):

```json
{
  "mcpServers": {
    "gitlab": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-gitlab"],
      "env": {
        "GITLAB_URL": "https://gitlab.spectrumflow.net",
        "GITLAB_TOKEN": "<your-personal-access-token>"
      }
    }
  }
}
```

### Getting a Personal Access Token

1. Go to https://gitlab.spectrumflow.net/-/user_settings/personal_access_tokens
2. Create a token with scopes: `api`, `read_repository`, `write_repository`
3. Name it "kiro-evergreen-terrace"
4. Store it in `.env` as `GITLAB_TOKEN`

## Available Tools

- `gitlab_create_merge_request` — Open an MR
- `gitlab_get_merge_request` — Get MR details and diff
- `gitlab_list_merge_requests` — List open MRs
- `gitlab_get_pipeline` — Get pipeline status
- `gitlab_list_pipelines` — List recent pipelines
- `gitlab_get_file` — Read a file from a repo
- `gitlab_create_file` — Create a file in a repo
- `gitlab_update_file` — Update a file in a repo
- `gitlab_list_issues` — List issues
- `gitlab_create_issue` — Create an issue

## Engineering Agent Usage

### MR Creation (eng-mid)

After implementing a feature, `eng-mid` creates an MR with:

```
Title: [type]: brief description (under 70 chars)
Description:
  ## What
  [what changed]

  ## Why
  [ticket reference and business reason]

  ## Testing
  [how to verify]

Source branch: feature/[ticket-id]-[slug]
Target branch: main (or develop, check project convention)
Labels: evergreen-terrace
```

### Pipeline Monitoring (momentum-sentinel)

The sentinel can query pipeline status as part of project health scoring:

```
gitlab_list_pipelines(project_id, ref="main", per_page=5)
```

A failing main branch pipeline is a health signal worth surfacing.

## Environment Variables

Add to `.env`:

```
GITLAB_URL=https://gitlab.spectrumflow.net
GITLAB_TOKEN=
```

## Key Repositories

The relevant GitLab project IDs are in `packages/@springfield-configs/gitlab/gitlab-repositories.json` within the Springfield workspace. Reference that file rather than hardcoding project IDs here.
