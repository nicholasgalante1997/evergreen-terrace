/** @module Policy-gated factory worktree creation and atomic provenance recording. */

import { mkdir, rename } from "node:fs/promises"
import { dirname } from "node:path"
import {
  createFactoryBranchName,
  isAllowedBaseRef,
  isProtectedBranch,
  loadProjectPolicy
} from "@evergreen-terrace/project-policy"
import { runProcess } from "../process/run-process"
import { deriveWorktreePaths } from "./worktree-paths"
import type { FactoryWorktreeRecord, WorktreePreparation, WorktreeRegistrationFailure } from "./worktree.types"

const goalIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const validatePreparation = (input: WorktreePreparation): void => {
  if (!goalIdPattern.test(input.goalId)) {
    throw new Error(`Goal ID must be a UUID: ${input.goalId}`)
  }
  if (!Number.isInteger(input.attempt) || input.attempt < 1) {
    throw new Error(`Worktree attempt must be a positive integer: ${input.attempt}`)
  }
}

export class FactoryWorktreeManager {
  constructor(
    private readonly factoryRoot: string,
    private readonly projectRoot: string
  ) {}

  async prepare(input: WorktreePreparation): Promise<FactoryWorktreeRecord> {
    validatePreparation(input)
    const policy = await loadProjectPolicy(this.projectRoot)
    if (!isAllowedBaseRef(policy, input.baseRef)) {
      throw new Error(`Base ref is not allowed by project policy: ${input.baseRef}`)
    }

    const base = await runProcess(
      ["git", "rev-parse", "--verify", `${input.baseSha ?? input.baseRef}^{commit}`],
      this.projectRoot
    )
    const baseSha = base.stdout.trim()
    const paths = deriveWorktreePaths(this.factoryRoot, policy.project_id, input.goalId, input.role, input.attempt)
    const branchBase = createFactoryBranchName(policy, {
      branchClass: input.branchClass,
      goalId: input.goalId,
      role: input.role
    })
    const branch = input.attempt === 1 ? branchBase : `${branchBase}-a${input.attempt}`
    if (isProtectedBranch(policy, branch)) {
      throw new Error(`Factory worktrees never use a protected branch: ${branch}`)
    }

    await mkdir(dirname(paths.worktreePath), { recursive: true })
    await runProcess(["git", "worktree", "add", "--detach", paths.worktreePath, baseSha], this.projectRoot)
    await runProcess(["git", "switch", "--create", branch], paths.worktreePath)

    const record: FactoryWorktreeRecord = {
      artifactDirectory: paths.artifactDirectory,
      attempt: input.attempt,
      baseRef: input.baseRef,
      baseSha,
      branch,
      createdAt: new Date().toISOString(),
      goalId: input.goalId,
      manifestPath: paths.manifestPath,
      projectId: policy.project_id,
      role: input.role,
      worktreePath: paths.worktreePath
    }
    await this.writeRecord(record)
    return record
  }

  /**
   * Recovery path for a launch interrupted after its worktree was created: the
   * recorded worktree is reused only when it still matches the request exactly
   * and is on its own branch. Anything else is refused, never repaired.
   */
  async prepareOrReuse(input: WorktreePreparation): Promise<FactoryWorktreeRecord> {
    validatePreparation(input)
    const policy = await loadProjectPolicy(this.projectRoot)
    const paths = deriveWorktreePaths(this.factoryRoot, policy.project_id, input.goalId, input.role, input.attempt)
    const manifest = Bun.file(paths.manifestPath)
    if (!(await manifest.exists())) {
      return this.prepare(input)
    }
    const record = (await manifest.json()) as FactoryWorktreeRecord
    const branch = (await runProcess(["git", "branch", "--show-current"], record.worktreePath)).stdout.trim()
    if (
      record.goalId !== input.goalId ||
      record.role !== input.role ||
      record.attempt !== input.attempt ||
      (input.baseSha !== undefined && record.baseSha !== input.baseSha) ||
      branch !== record.branch
    ) {
      throw new Error(
        `Existing worktree ${record.worktreePath} does not match the requested ${input.role} attempt ${input.attempt}`
      )
    }
    return record
  }

  async recordWorkerRegistrationFailure(record: FactoryWorktreeRecord, error: unknown): Promise<string> {
    const failurePath = `${dirname(record.manifestPath)}/worker-registration.failure.json`
    const failure: WorktreeRegistrationFailure = {
      failedAt: new Date().toISOString(),
      manifestPath: record.manifestPath,
      message: error instanceof Error ? error.message : String(error),
      stage: "worker_registration",
      worktreePath: record.worktreePath
    }
    await this.writeAtomicJson(failurePath, failure)
    return failurePath
  }

  private async writeRecord(record: FactoryWorktreeRecord): Promise<void> {
    await this.writeAtomicJson(record.manifestPath, record)
  }

  private async writeAtomicJson(path: string, value: object): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`
    await Bun.write(temporaryPath, `${JSON.stringify(value, null, 2)}\n`)
    await rename(temporaryPath, path)
  }
}
