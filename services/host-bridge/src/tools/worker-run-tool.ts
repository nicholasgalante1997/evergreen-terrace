/** @module Governed single-worker ACP execution MCP tool. */

import type { McpTool } from "@evergreen-terrace/mcp-core"
import { z } from "zod"
import type { CommandApiClient } from "../command-api/command-api-client"
import type { WorkerScheduler } from "../workers/worker-scheduler"
import { toolResult } from "./tool-result"

const inputSchema = z
  .object({
    prompt: z.string().min(1).max(40_000),
    workerId: z.string().uuid()
  })
  .strict()

export class WorkerRunTool implements McpTool {
  readonly definition = {
    description:
      "Record a durable brief for one assigned worker and run it through ACP under a scheduler lease in its factory worktree. Sensitive ACP permission requests become durable decision cards and block until resolved.",
    inputSchema: z.toJSONSchema(inputSchema, { io: "input" }),
    name: "evergreen.worker.run"
  }

  constructor(
    private readonly commandApi: CommandApiClient,
    private readonly scheduler: WorkerScheduler
  ) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const input = inputSchema.parse(argumentsValue)
    const worker = await this.commandApi.getWorker(input.workerId)
    if (worker.state !== "assigned") {
      throw new Error(`Worker must be assigned before execution; current state: ${worker.state}`)
    }
    const goalId = await this.scheduler.recordBriefs([input])
    const schedule = this.scheduler.start({ goalId, maxConcurrency: 1, workerIds: [input.workerId] })
    return toolResult(await schedule.completion)
  }
}
