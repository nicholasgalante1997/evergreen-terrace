/** @module Read-only workspace status MCP tool. */

import type { McpTool } from "@evergreen-terrace/mcp-core"
import type { GitWorkspace } from "../workspace/git-workspace"
import { toolResult } from "./tool-result"

export class WorkspaceStatusTool implements McpTool {
  readonly definition = {
    description:
      "Read the onboarded workspace's local branch, commit, and configured canonical remote without changing it.",
    inputSchema: { additionalProperties: false, properties: {}, type: "object" },
    name: "evergreen.workspace.status"
  }

  constructor(private readonly workspace: GitWorkspace) {}

  async invoke(): Promise<ReturnType<typeof toolResult>> {
    return toolResult(await this.workspace.status())
  }
}
