/** @module Durable decision-card request MCP tool. */

import { decisionRequestSchema } from "@evergreen-terrace/contracts"
import type { McpTool } from "@evergreen-terrace/mcp-core"
import { z } from "zod"
import type { CommandApiClient } from "../command-api/command-api-client"
import { toolResult } from "./tool-result"

export class DecisionRequestTool implements McpTool {
  readonly definition = {
    description:
      "Persist a decision card for an ambiguity or policy-defined risk. This tool only requests a decision; it cannot take the proposed external action.",
    inputSchema: z.toJSONSchema(decisionRequestSchema, { io: "input" }),
    name: "evergreen.decision.request"
  }

  constructor(private readonly commandApi: CommandApiClient) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    return toolResult(await this.commandApi.requestDecision(decisionRequestSchema.parse(argumentsValue)))
  }
}
