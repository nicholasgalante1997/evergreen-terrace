/** @module Policy-gated durable goal-submission MCP tool. */

import { z } from "zod"
import type { McpTool } from "@evergreen-terrace/mcp-core"
import type { CommandApiClient } from "../command-api/command-api-client"
import type { GitWorkspace } from "../workspace/git-workspace"
import { toolResult } from "./tool-result"

const inputSchema = z
  .object({
    baseRef: z.string().min(1).optional(),
    constraints: z.array(z.string().max(2_048)).max(32).default([]),
    description: z.string().min(1).max(20_000),
    idempotencyKey: z.string().min(1).max(128).optional(),
    priorityClass: z.string().min(1).max(64).default("p1"),
    references: z.array(z.string().max(2_048)).max(32).default([]),
    title: z.string().min(1).max(240)
  })
  .strict()

export class GoalSubmitTool implements McpTool {
  readonly definition = {
    description:
      "Validate an onboarded local workspace policy and submit one durable bounded engineering goal. This does not write to the workspace or start workers.",
    inputSchema: z.toJSONSchema(inputSchema, { io: "input" }),
    name: "evergreen.goal.submit"
  }

  constructor(
    private readonly commandApi: CommandApiClient,
    private readonly workspace: GitWorkspace
  ) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const input = inputSchema.parse(argumentsValue)
    const baseRef = input.baseRef ?? "main"
    const { baseSha, policy } = await this.workspace.resolveGoalBase({ baseRef, priorityClass: input.priorityClass })
    const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID()
    const result = await this.commandApi.submitGoal({
      baseRef,
      baseSha,
      constraints: input.constraints,
      description: input.description,
      idempotencyKey,
      priorityClass: input.priorityClass,
      projectId: policy.project_id,
      references: input.references,
      title: input.title
    })
    return toolResult({ ...result, baseRef, baseSha, idempotencyKey, projectId: policy.project_id })
  }
}
