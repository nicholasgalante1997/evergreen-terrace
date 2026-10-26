# GitLab integration (archived)

The legacy integration guide is intentionally inactive. GitHub through `gh` is
the only remote-code-host capability in v1. A later GitLab capability must be a
governed, first-party host-bridge tool; workers must not receive an external
server package or persistent third-party credential.

## Candidate tools

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

## Future usage constraints

### Merge-request creation

If GitLab support is approved, a policy-permitted factory branch may create an
MR with:

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

### Pipeline monitoring

The future monitor may query pipeline status as part of project health scoring:

```
gitlab_list_pipelines(project_id, ref="main", per_page=5)
```

A failing main branch pipeline is a health signal worth surfacing.
