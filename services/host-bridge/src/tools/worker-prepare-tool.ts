/** @module Worktree-backed durable worker-assignment MCP tool. */

import { workerAdapterSchema } from "@evergreen-terrace/contracts"
import type { McpTool } from "@evergreen-terrace/mcp-core"
import { assertWorkerRole } from "@evergreen-terrace/project-policy"
import { z } from "zod"
import type { CommandApiClient } from "../command-api/command-api-client"
import type { FactoryWorktreeManager } from "../worktrees/factory-worktree-manager"
import { toolResult } from "./tool-result"

const inputSchema = z
  .object({
    adapter: workerAdapterSchema,
    attempt: z.number().int().min(1).default(1),
    baseRef: z.string().min(1).default("main"),
    branchClass: z.string().min(1).default("feature"),
    dependsOnWorkerIds: z.array(z.string().uuid()).max(16).default([]),
    goalId: z.string().uuid(),
    idempotencyKey: z.string().min(1).max(128),
    role: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)
  })
  .strict()

export class WorkerPrepareTool implements McpTool {
  readonly definition = {
    description:
      "Create a factory-owned worktree and persist one assigned worker with its immutable provenance. It does not run an adapter or modify the active checkout.",
    inputSchema: z.toJSONSchema(inputSchema, { io: "input" }),
    name: "evergreen.worker.prepare"
  }

  constructor(
    private readonly worktrees: FactoryWorktreeManager,
    private readonly commandApi: CommandApiClient
  ) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const input = inputSchema.parse(argumentsValue)
    assertWorkerRole(input.role)
    const worktree = await this.worktrees.prepare(input)
    try {
      const worker = await this.commandApi.assignWorker({
        adapter: input.adapter,
        dependsOnWorkerIds: input.dependsOnWorkerIds,
        goalId: input.goalId,
        idempotencyKey: input.idempotencyKey,
        projectId: worktree.projectId,
        role: input.role,
        worktree: {
          artifactDirectory: worktree.artifactDirectory,
          attempt: worktree.attempt,
          baseRef: worktree.baseRef,
          baseSha: worktree.baseSha,
          branch: worktree.branch,
          manifestPath: worktree.manifestPath,
          worktreePath: worktree.worktreePath
        }
      })
      return toolResult({ worker, worktree })
    } catch (error) {
      const failurePath = await this.worktrees.recordWorkerRegistrationFailure(worktree, error)
      throw new Error(`Worker registration failed; preserved recovery record: ${failurePath}`, { cause: error })
    }
  }
}
