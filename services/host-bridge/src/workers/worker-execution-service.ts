/** @module Durable worker lifecycle orchestration around an ACP session. */

import type { ProjectPolicy } from "@evergreen-terrace/project-policy"
import type { CommandApiClient } from "../command-api/command-api-client"
import { AcpWorkerRunner } from "./acp-runner"
import { DecisionPermissionResolver } from "./decision-permission-resolver"
import type { WorkerExecutionInput, WorkerExecutionResult } from "./worker-execution.types"
import { WorktreePermissionResolver } from "./worktree-permission-resolver"

export class WorkerExecutionService {
  constructor(
    private readonly commandApi: CommandApiClient,
    /** Read per session, so a policy edit applies to the next worker without a bridge restart. */
    private readonly loadPolicy: () => Promise<ProjectPolicy>
  ) {}

  /** The caller must already hold the worker lease named by `schedulerId`. */
  async execute(input: WorkerExecutionInput): Promise<WorkerExecutionResult> {
    const policy = await this.loadPolicy()
    await this.commandApi.changeWorkerState(input.workerId, {
      detail: "ACP worker session started.",
      schedulerId: input.schedulerId,
      state: "running"
    })
    const runner = new AcpWorkerRunner(
      new WorktreePermissionResolver(
        input.worktreePath,
        {
          autoApproveValidationCommands: policy.permissions.auto_approve_validation_commands,
          validationCommands: policy.validation.commands
        },
        new DecisionPermissionResolver(this.commandApi, {
          goalId: input.goalId,
          projectId: input.projectId,
          role: input.role,
          schedulerId: input.schedulerId,
          workerId: input.workerId,
          worktreePath: input.worktreePath
        })
      )
    )
    try {
      const result = await runner.run(input)
      await this.commandApi.changeWorkerState(input.workerId, {
        detail: `ACP worker session completed with stop reason: ${result.stopReason}.`,
        schedulerId: input.schedulerId,
        state: "completed"
      })
      return { result, workerId: input.workerId }
    } catch (error) {
      await this.commandApi.changeWorkerState(input.workerId, {
        detail: "ACP worker session failed. Consult the worker artifact result for details.",
        schedulerId: input.schedulerId,
        state: "failed"
      })
      throw error
    }
  }
}
