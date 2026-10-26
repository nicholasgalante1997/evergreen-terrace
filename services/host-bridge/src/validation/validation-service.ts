/** @module Durable validation of one exact commit in a factory worktree. */

import { mkdir } from "node:fs/promises"
import type { ProjectPolicy } from "@evergreen-terrace/project-policy"
import { FactoryGit } from "../git/factory-git"
import type { ValidationEvidencePort } from "./validation-service.types"
import type { ValidationCommandRunner, ValidationOutcome, ValidationPlan, ValidationRequest } from "./validation.types"

export const validationPlan = (policy: ProjectPolicy): ValidationPlan => ({
  checks: policy.validation.commands,
  setup: policy.validation.setup,
  timeoutSeconds: policy.validation.timeout_seconds
})

export class ValidationService {
  constructor(
    private readonly commandApi: ValidationEvidencePort,
    private readonly runner: ValidationCommandRunner,
    private readonly loadPolicy: () => Promise<ProjectPolicy>
  ) {}

  /** The worktree must be clean so the recorded commit is exactly what was validated. */
  async validate(request: ValidationRequest): Promise<ValidationOutcome> {
    const git = new FactoryGit(request.worktreePath)
    if (!(await git.isClean())) {
      throw new Error(`Validation requires a clean worktree: ${request.worktreePath}`)
    }
    const commitSha = await git.head()
    await mkdir(request.artifactDirectory, { recursive: true })
    const run = await this.runner.run({
      artifactDirectory: request.artifactDirectory,
      plan: validationPlan(await this.loadPolicy()),
      worktreePath: request.worktreePath
    })
    const recorded = await this.commandApi.recordValidation({
      artifactDirectory: request.artifactDirectory,
      commitSha,
      completedAt: run.completedAt,
      goalId: request.goalId,
      idempotencyKey: request.idempotencyKey,
      projectId: request.projectId,
      results: run.results,
      startedAt: run.startedAt,
      status: run.status,
      subject: request.subject
    })
    return { commitSha, status: recorded.status, validationId: recorded.validationId }
  }
}
