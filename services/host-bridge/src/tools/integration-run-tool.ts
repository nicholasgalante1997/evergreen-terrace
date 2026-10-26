/** @module Governed per-goal integration-train MCP tools. */

import { workerAdapterSchema } from "@evergreen-terrace/contracts"
import type { McpTool } from "@evergreen-terrace/mcp-core"
import { z } from "zod"
import type { IntegrationTrain } from "../integration/integration-train"
import { toolResult } from "./tool-result"

const runSchema = z
  .object({
    branchClass: z.string().min(1).default("feature"),
    excludeWorkerIds: z.array(z.string().uuid()).max(16).default([]),
    goalId: z.string().uuid(),
    selectionRationale: z.string().min(1).max(4_000).optional()
  })
  .strict()

const resolveSchema = z
  .object({
    adapter: workerAdapterSchema.default("claude"),
    branchClass: z.string().min(1).default("feature"),
    integrationId: z.string().uuid()
  })
  .strict()

export class IntegrationRunTool implements McpTool {
  readonly definition = {
    description:
      "Run the integration train for one goal whose workers are all completed or cancelled. It merges their branches in dependency order onto a new per-goal factory branch, records overlap and conflict evidence and the aggregate diff, and revalidates the result. To leave a worker's output out, pass excludeWorkerIds with a selectionRationale; dependents of an excluded worker must also be excluded. It never pushes or touches a protected branch.",
    inputSchema: z.toJSONSchema(runSchema, { io: "input" }),
    name: "evergreen.integration.run"
  }

  constructor(private readonly train: IntegrationTrain) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const input = runSchema.parse(argumentsValue)
    return toolResult(
      await this.train.run({
        branchClass: input.branchClass,
        excludeWorkerIds: input.excludeWorkerIds,
        goalId: input.goalId,
        ...(input.selectionRationale === undefined ? {} : { selectionRationale: input.selectionRationale })
      })
    )
  }
}

export class IntegrationResolveTool implements McpTool {
  readonly definition = {
    description:
      "Resolve a conflicted integration with the integrator agent, as a new attempt that references it. When a merge conflicts, the integrator, an ACP worker with its own lease and decision cards, edits only the conflicted files. The host commits its work only if the merge is still open, no conflict markers remain, and nothing outside those files changed. It records the agent's rationale, then revalidates.",
    inputSchema: z.toJSONSchema(resolveSchema, { io: "input" }),
    name: "evergreen.integration.resolve"
  }

  constructor(private readonly train: IntegrationTrain) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    return toolResult(await this.train.resolve(resolveSchema.parse(argumentsValue)))
  }
}
