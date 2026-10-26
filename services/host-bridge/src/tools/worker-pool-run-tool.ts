/** @module Durable dependency-aware worker-schedule MCP tool. */

import type { McpTool } from "@evergreen-terrace/mcp-core"
import { z } from "zod"
import type { WorkerScheduler } from "../workers/worker-scheduler"
import { toolResult } from "./tool-result"

const inputSchema = z
  .object({
    maxConcurrency: z.number().int().min(1).max(6).default(3),
    wait: z.boolean().default(false),
    workers: z
      .array(
        z
          .object({
            prompt: z.string().min(1).max(40_000),
            workerId: z.string().uuid()
          })
          .strict()
      )
      .min(2)
      .max(6)
      .refine((workers) => new Set(workers.map((worker) => worker.workerId)).size === workers.length, {
        message: "worker IDs must be unique"
      })
  })
  .strict()

export class WorkerPoolRunTool implements McpTool {
  readonly definition = {
    description:
      "Record durable briefs for two to six assigned workers of one goal and start a lease-based, dependency-aware schedule. Returns immediately unless wait is true; inspect progress with evergreen.schedule.status and resume after a restart with evergreen.schedule.resume.",
    inputSchema: z.toJSONSchema(inputSchema, { io: "input" }),
    name: "evergreen.worker_pool.run"
  }

  constructor(private readonly scheduler: WorkerScheduler) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const input = inputSchema.parse(argumentsValue)
    const goalId = await this.scheduler.recordBriefs(input.workers)
    const schedule = this.scheduler.start({
      goalId,
      maxConcurrency: input.maxConcurrency,
      workerIds: input.workers.map((worker) => worker.workerId)
    })
    const started = { alreadyRunning: schedule.alreadyRunning, goalId, schedulerId: schedule.schedulerId }
    return toolResult(input.wait ? { ...started, result: await schedule.completion } : { ...started, started: true })
  }
}
