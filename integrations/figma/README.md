# Figma Integration

MCP wrapper for Figma. Used by design-adjacent agents to read design specs, inspect component properties, and access design tokens from Figma files.

## MCP Server

Uses the Figma-provided MCP server (available via Figma's developer platform).

### Configuration

Add to your Kiro MCP settings (`.kiro/settings/mcp.json`):

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "figma-mcp"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "<your-personal-access-token>"
      }
    }
  }
}
```

### Getting a Personal Access Token

1. Go to https://www.figma.com/settings → Personal access tokens
2. Create a token named "kiro-evergreen-terrace"
3. Store it in `.env` as `FIGMA_ACCESS_TOKEN`

## Available Tools

- `figma_get_file` — Get a Figma file's full node tree
- `figma_get_node` — Get a specific node by ID
- `figma_get_components` — List components in a file
- `figma_get_styles` — List styles (colors, text, effects)
- `figma_get_variables` — Get design variables (tokens)
- `figma_get_images` — Export node images
- `figma_get_comments` — Read file comments

## Design Agent Usage

### Spec Reading

When `eng-mid` needs to implement a design:

1. Get the Figma file URL from the ticket or design handoff
2. Extract the file key from the URL: `figma.com/file/{FILE_KEY}/...`
3. Use `figma_get_node` to inspect specific component specs
4. Read spacing, color, and typography values against Fidget token equivalents

### Token Sync (fidget-tokens)

The `fidget-tokens` repo has a Figma sync pipeline in `core/bin/`. The Figma MCP is a read-only complement to that — for ad-hoc inspection, not the automated sync.

For the automated token sync, use the existing `@fidget-tokens/jobs` pipeline.

### Design QA

When reviewing implementation against design:

1. Use `figma_get_node` to get the design spec for a component
2. Compare spacing, color, and typography values
3. Flag discrepancies as review comments

## Key Figma Files

Document Figma file keys here as they're identified:

```
# Fidget Design System
FIGMA_FIDGET_FILE_KEY=

# agent-os Design Files
FIGMA_AGENT_OS_FILE_KEY=
```

## Environment Variables

Add to `.env`:

```
FIGMA_ACCESS_TOKEN=
FIGMA_FIDGET_FILE_KEY=
FIGMA_AGENT_OS_FILE_KEY=
```
