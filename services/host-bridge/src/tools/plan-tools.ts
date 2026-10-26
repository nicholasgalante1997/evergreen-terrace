/** @module Governed mayor planning MCP tools. */

import { workerAdapterSchema } from "@evergreen-terrace/contracts"
import type { McpTool } from "@evergreen-terrace/mcp-core"
import { z } from "zod"
import type { CommandApiClient } from "../command-api/command-api-client"
import type { MayorPlanner } from "../planning/mayor-planner"
import { toolResult } from "./tool-result"

const draftSchema = z
  .object({
    adapter: workerAdapterSchema.default("claude"),
    feedback: z.string().max(8_000).optional(),
    goalId: z.string().uuid(),
    idempotencyKey: z.string().min(1).max(128).optional(),
    wait: z.boolean().default(false)
  })
  .strict()

const launchSchema = z
  .object({
    adapter: workerAdapterSchema.default("claude"),
    branchClass: z.string().min(1).default("feature"),
    maxConcurrency: z.number().int().min(1).max(6).default(3),
    planId: z.string().uuid(),
    wait: z.boolean().default(false)
  })
  .strict()

const statusSchema = z.object({ goalId: z.string().uuid() }).strict()

export class PlanDraftTool implements McpTool {
  readonly definition = {
    description:
      "Have the mayor plan a submitted goal in a read-only checkout of its base: a bounded contract, scope-claimed tasks, a dependency graph, worker briefs, and risks. The result is a plan_approval decision card, or ambiguity cards when the mayor needs answers first. It creates no worktree and starts no worker. Drafting the next revision picks up the engineer's answers and revision notes. Returns immediately unless wait is true.",
    inputSchema: z.toJSONSchema(draftSchema, { io: "input" }),
    name: "evergreen.plan.draft"
  }

  constructor(private readonly planner: MayorPlanner) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const input = draftSchema.parse(argumentsValue)
    const started = await this.planner.draft({
      adapter: input.adapter,
      ...(input.feedback === undefined ? {} : { feedback: input.feedback }),
      goalId: input.goalId,
      ...(input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey })
    })
    const summary = { planId: started.planId, revision: started.revision }
    return toolResult(input.wait ? { ...summary, result: await started.completion } : { ...summary, status: "drafting" })
  }
}

export class PlanLaunchTool implements McpTool {
  readonly definition = {
    description:
      "Launch an approved plan: create one factory worktree and worker per task, record each brief with its scope claim, and start the dependency-ordered schedule. Refused until the plan_approval card is resolved; any resolution other than approval rejects the plan. A re-run after a crash reuses what was created. Returns immediately unless wait is true.",
    inputSchema: z.toJSONSchema(launchSchema, { io: "input" }),
    name: "evergreen.plan.launch"
  }

  constructor(private readonly planner: MayorPlanner) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const input = launchSchema.parse(argumentsValue)
    const outcome = await this.planner.launch(input)
    if (outcome.status === "rejected") {
      return toolResult(outcome)
    }
    const { completion, ...launched } = outcome
    return toolResult(input.wait ? { ...launched, result: await completion } : { ...launched, started: true })
  }
}

export class PlanStatusTool implements McpTool {
  readonly definition = {
    description:
      "List a goal's plan revisions with status, the full proposal including every worker brief and scope claim, cross-goal overlaps, the approval and question decision card IDs, and the launched workers.",
    inputSchema: z.toJSONSchema(statusSchema, { io: "input" }),
    name: "evergreen.plan.status"
  }

  constructor(private readonly commandApi: CommandApiClient) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const { goalId } = statusSchema.parse(argumentsValue)
    return toolResult({ goalId, plans: await this.commandApi.listGoalPlans(goalId) })
  }
}
