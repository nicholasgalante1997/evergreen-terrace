/** @module Strongly consistent goal-schedule status MCP tool. */

import type { McpTool } from "@evergreen-terrace/mcp-core"
import { z } from "zod"
import type { CommandApiClient } from "../command-api/command-api-client"
import type { WorkerScheduler } from "../workers/worker-scheduler"
import { toolResult } from "./tool-result"

const inputSchema = z.object({ goalId: z.string().uuid() }).strict()

export class ScheduleStatusTool implements McpTool {
  readonly definition = {
    description:
      "Report every worker of a goal with its lifecycle state, dependency IDs, brief digest, and lease holder from the command API, plus whether this bridge is actively scheduling the goal.",
    inputSchema: z.toJSONSchema(inputSchema, { io: "input" }),
    name: "evergreen.schedule.status"
  }

  constructor(
    private readonly commandApi: CommandApiClient,
    private readonly scheduler: WorkerScheduler
  ) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const { goalId } = inputSchema.parse(argumentsValue)
    const workers = await this.commandApi.listGoalWorkers(goalId)
    return toolResult({
      activeInThisBridge: this.scheduler.activeGoalIds().includes(goalId),
      goalId,
      schedulerId: this.scheduler.schedulerId,
      workers: workers.map((worker) => ({
        adapter: worker.adapter,
        briefSha256: worker.briefSha256,
        dependsOnWorkerIds: worker.dependsOnWorkerIds,
        id: worker.id,
        leaseExpiresAt: worker.leaseExpiresAt,
        leaseOwner: worker.leaseOwner,
        role: worker.role,
        state: worker.state
      }))
    })
  }
}
