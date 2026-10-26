/** @module Strongly consistent goal integration and validation evidence MCP tool. */

import type { McpTool } from "@evergreen-terrace/mcp-core"
import { z } from "zod"
import type { CommandApiClient } from "../command-api/command-api-client"
import { toolResult } from "./tool-result"

const inputSchema = z.object({ goalId: z.string().uuid() }).strict()

export class IntegrationStatusTool implements McpTool {
  readonly definition = {
    description:
      "List every integration attempt and validation record for a goal, with merge order, overlaps, conflicts, aggregate diff, and per-command validation results.",
    inputSchema: z.toJSONSchema(inputSchema, { io: "input" }),
    name: "evergreen.integration.status"
  }

  constructor(private readonly commandApi: CommandApiClient) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const { goalId } = inputSchema.parse(argumentsValue)
    return toolResult({ goalId, ...(await this.commandApi.listGoalEvidence(goalId)) })
  }
}
