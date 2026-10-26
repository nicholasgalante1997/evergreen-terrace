/** @module Governed single-worker validation MCP tool. */

import type { McpTool } from "@evergreen-terrace/mcp-core"
import { z } from "zod"
import type { CommandApiClient } from "../command-api/command-api-client"
import { FactoryGit } from "../git/factory-git"
import type { ValidationService } from "../validation/validation-service"
import { toolResult } from "./tool-result"

const inputSchema = z.object({ workerId: z.string().uuid() }).strict()

export class ValidationRunTool implements McpTool {
  readonly definition = {
    description:
      "Validate one completed worker: capture any uncommitted output as a factory commit on its branch, then run the .et validation commands in a sandbox (setup with network, checks offline) and record durable evidence for that exact commit.",
    inputSchema: z.toJSONSchema(inputSchema, { io: "input" }),
    name: "evergreen.validation.run"
  }

  constructor(
    private readonly commandApi: CommandApiClient,
    private readonly validation: ValidationService
  ) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const { workerId } = inputSchema.parse(argumentsValue)
    const worker = await this.commandApi.getWorker(workerId)
    if (worker.state !== "completed") {
      throw new Error(`Only a completed worker can be validated; current state: ${worker.state}`)
    }
    const git = new FactoryGit(worker.worktree.worktreePath)
    const captureCommitSha = await git.captureWorkerOutput(`evergreen: capture output of ${worker.role} (${worker.id})`)
    const commitSha = await git.head()
    const outcome = await this.validation.validate({
      artifactDirectory: `${worker.worktree.artifactDirectory}/validation/${commitSha}`,
      goalId: worker.goalId,
      idempotencyKey: `validation-worker-${worker.id}-${crypto.randomUUID()}`,
      projectId: worker.projectId,
      subject: { id: worker.id, type: "worker" },
      worktreePath: worker.worktree.worktreePath
    })
    return toolResult({ ...outcome, captureCommitSha, workerId })
  }
}
