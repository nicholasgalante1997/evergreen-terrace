/** @module Governed GitHub handoff MCP tools. */

import type { McpTool } from "@evergreen-terrace/mcp-core"
import { z } from "zod"
import type { CommandApiClient } from "../command-api/command-api-client"
import type { HandoffService } from "../handoff/handoff-service"
import { toolResult } from "./tool-result"

const requestSchema = z.object({ integrationId: z.string().uuid() }).strict()
const executeSchema = z.object({ handoffId: z.string().uuid() }).strict()
const statusSchema = z.object({ goalId: z.string().uuid() }).strict()

export class HandoffRequestTool implements McpTool {
  readonly definition = {
    description:
      "Plan the GitHub handoff of a validated integration: push its exact head to a factory branch and open a pull request into the goal's base. Records the plan and an external_side_effect decision card; it does not contact GitHub.",
    inputSchema: z.toJSONSchema(requestSchema, { io: "input" }),
    name: "evergreen.handoff.request"
  }

  constructor(private readonly handoffs: HandoffService) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    return toolResult(await this.handoffs.request(requestSchema.parse(argumentsValue).integrationId))
  }
}

export class HandoffExecuteTool implements McpTool {
  readonly definition = {
    description:
      "Execute an approved handoff exactly as recorded: push without force, open or reuse the pull request, and comment on a superseded goal PR. It refuses while the decision card is unresolved, and a re-run reconciles steps already done. It never merges.",
    inputSchema: z.toJSONSchema(executeSchema, { io: "input" }),
    name: "evergreen.handoff.execute"
  }

  constructor(private readonly handoffs: HandoffService) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    return toolResult(await this.handoffs.execute(executeSchema.parse(argumentsValue).handoffId))
  }
}

export class HandoffStatusTool implements McpTool {
  readonly definition = {
    description:
      "List a goal's handoffs with their approved plan, decision card ID, status, result, and the exact pull request body that will be or was posted.",
    inputSchema: z.toJSONSchema(statusSchema, { io: "input" }),
    name: "evergreen.handoff.status"
  }

  constructor(private readonly commandApi: CommandApiClient) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const { goalId } = statusSchema.parse(argumentsValue)
    return toolResult({ goalId, handoffs: await this.commandApi.listGoalHandoffs(goalId) })
  }
}
