/** @module Durable goal-schedule resume MCP tool. */

import type { McpTool } from "@evergreen-terrace/mcp-core"
import { z } from "zod"
import type { WorkerScheduler } from "../workers/worker-scheduler"
import { toolResult } from "./tool-result"

const inputSchema = z
  .object({
    goalId: z.string().uuid(),
    maxConcurrency: z.number().int().min(1).max(6).default(3),
    wait: z.boolean().default(false)
  })
  .strict()

export class ScheduleResumeTool implements McpTool {
  readonly definition = {
    description:
      "Resume a goal's schedule from durable state: reconcile expired leases (failing, never replaying, sessions that lost liveness), then launch briefed assigned workers whose dependencies completed.",
    inputSchema: z.toJSONSchema(inputSchema, { io: "input" }),
    name: "evergreen.schedule.resume"
  }

  constructor(private readonly scheduler: WorkerScheduler) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const input = inputSchema.parse(argumentsValue)
    const schedule = this.scheduler.start({ goalId: input.goalId, maxConcurrency: input.maxConcurrency })
    const started = { alreadyRunning: schedule.alreadyRunning, goalId: input.goalId, schedulerId: schedule.schedulerId }
    return toolResult(input.wait ? { ...started, result: await schedule.completion } : { ...started, started: true })
  }
}
