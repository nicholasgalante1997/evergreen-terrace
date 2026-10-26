/** @module Factory worktree preparation MCP tool. */

import { z } from "zod"
import type { McpTool } from "@evergreen-terrace/mcp-core"
import type { FactoryWorktreeManager } from "../worktrees/factory-worktree-manager"
import { toolResult } from "./tool-result"

const inputSchema = z
  .object({
    attempt: z.number().int().min(1).default(1),
    baseRef: z.string().min(1).default("main"),
    branchClass: z.string().min(1).default("feature"),
    goalId: z.string().uuid(),
    role: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)
  })
  .strict()

export class WorktreePrepareTool implements McpTool {
  readonly definition = {
    description:
      "Create one policy-gated factory-owned Git worktree and feature branch outside the active checkout, then atomically record its provenance.",
    inputSchema: z.toJSONSchema(inputSchema, { io: "input" }),
    name: "evergreen.worktree.prepare"
  }

  constructor(private readonly worktrees: FactoryWorktreeManager) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    return toolResult(await this.worktrees.prepare(inputSchema.parse(argumentsValue)))
  }
}
