/** @module Durable decision-card resolution MCP tool. */

import { z } from "zod"
import { decisionResolutionSchema } from "@evergreen-terrace/contracts"
import type { McpTool } from "@evergreen-terrace/mcp-core"
import type { CommandApiClient } from "../command-api/command-api-client"
import { toolResult } from "./tool-result"

const inputSchema = z
  .object({
    decisionId: z.string().uuid(),
    resolution: decisionResolutionSchema
  })
  .strict()

export class DecisionResolveTool implements McpTool {
  readonly definition = {
    description:
      "Resolve one durable decision card. Approval records the selected option but does not itself execute a merge, push, release, or external side effect.",
    inputSchema: z.toJSONSchema(inputSchema, { io: "input" }),
    name: "evergreen.decision.resolve"
  }

  constructor(private readonly commandApi: CommandApiClient) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const input = inputSchema.parse(argumentsValue)
    return toolResult(await this.commandApi.resolveDecision(input.decisionId, input.resolution))
  }
}
