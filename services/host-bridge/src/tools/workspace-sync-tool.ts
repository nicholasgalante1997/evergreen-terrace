/** @module Explicit remote-ref synchronization MCP tool. */

import { z } from "zod"
import type { McpTool, McpToolResult } from "@evergreen-terrace/mcp-core"
import type { GitWorkspace } from "../workspace/git-workspace"
import { toolResult } from "./tool-result"

const inputSchema = z.object({ confirm: z.literal(true).optional() }).strict()

export class WorkspaceSyncTool implements McpTool {
  readonly definition = {
    description:
      "Explicitly fetch/prune the configured canonical remote and refresh GitHub metadata through gh, without modifying the active checkout. Call first without confirm to receive the decision requirement.",
    inputSchema: z.toJSONSchema(inputSchema, { io: "input" }),
    name: "evergreen.workspace.sync"
  }

  constructor(private readonly workspace: GitWorkspace) {}

  async invoke(argumentsValue: unknown): Promise<McpToolResult> {
    const input = inputSchema.parse(argumentsValue)
    if (input.confirm !== true) {
      return {
        content: [
          {
            text: "workspace.sync will run git fetch --prune and gh repo view against the configured project; repeat with confirm: true to approve this external action.",
            type: "text"
          }
        ],
        isError: true
      }
    }
    return toolResult(await this.workspace.sync())
  }
}
