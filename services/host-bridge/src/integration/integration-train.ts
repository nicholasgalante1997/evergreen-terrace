/** @module Per-goal integration train: select, compose, resolve, analyze, and revalidate worker output. */

import { EventEmitter } from "node:events"
import { mkdir } from "node:fs/promises"
import type {
  IntegrationCompletion,
  IntegrationResolution,
  IntegrationSelection,
  IntegrationSource,
  WorkerAdapter
} from "@evergreen-terrace/contracts"
import { integrationRole, integratorRole } from "@evergreen-terrace/project-policy"
import type { CommandGoalSnapshot, CommandWorkerSnapshot } from "../command-api/command-api-client.types"
import { FactoryGit } from "../git/factory-git"
import type { FactoryWorktreeRecord } from "../worktrees/worktree.types"
import { changedFileOverlaps, mergeOrder } from "./integration-plan"
import type {
  IntegrationResolveInput,
  IntegrationRunInput,
  IntegrationRunResult,
  IntegrationTrainPorts
} from "./integration-train.types"

export class IntegrationPreconditionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "IntegrationPreconditionError"
  }
}

const notCreated = "(not created)"
const maximumResolutions = 8

interface AttemptPlan {
  goal: CommandGoalSnapshot
  integrator: WorkerAdapter | null
  resolvesIntegrationId: string | null
  selection: IntegrationSelection | null
  sources: CommandWorkerSnapshot[]
}

/**
 * Integrates one goal on its own factory branch, in dependency order:
 *
 * 1. Refuses, recording nothing, unless every source worker is `completed` or
 *    `cancelled`. Integrator workers are never sources. An exclusion needs a
 *    rationale and may not strand a dependent worker.
 * 2. Records intent (`integration.updated: started`) before any Git side effect.
 * 3. Captures uncommitted worker output as a factory commit on each worker branch.
 * 4. Creates a fresh integration worktree pinned to the goal's recorded base SHA.
 * 5. Merges sources in dependency order. On a conflict, a plain run aborts and
 *    records it. A resolve run leaves the merge open for the integrator agent
 *    and commits only a host-verified resolution.
 * 6. Writes the aggregate patch, revalidates the composed head, and records the result.
 *
 * Nothing is pushed and no protected branch is touched. Each run is a new attempt.
 */
export class IntegrationTrain extends EventEmitter {
  constructor(private readonly ports: IntegrationTrainPorts) {
    super()
  }

  async run(input: IntegrationRunInput): Promise<IntegrationRunResult> {
    const goal = await this.ports.commandApi.getGoal(input.goalId)
    const workers = await this.ports.commandApi.listGoalWorkers(input.goalId)
    const selection = this.selection(workers, input.excludeWorkerIds ?? [], input.selectionRationale)
    return this.attempt(input.branchClass, {
      goal,
      integrator: null,
      resolvesIntegrationId: null,
      selection,
      sources: this.sourceWorkers(workers, selection)
    })
  }

  /** Re-runs a `conflicted` attempt as a new attempt in which the integrator agent resolves conflicts. */
  async resolve(input: IntegrationResolveInput): Promise<IntegrationRunResult> {
    if (this.ports.integrator === undefined) {
      throw new IntegrationPreconditionError("No integrator agent is configured for this bridge")
    }
    const previous = await this.ports.commandApi.getIntegration(input.integrationId)
    if (previous.status !== "conflicted" || previous.completion === null) {
      throw new IntegrationPreconditionError(`Only a conflicted integration can be resolved; it is ${previous.status}`)
    }
    const goal = await this.ports.commandApi.getGoal(previous.goalId)
    const workers = await this.ports.commandApi.listGoalWorkers(previous.goalId)
    const selection = previous.completion.selection
    return this.attempt(input.branchClass, {
      goal,
      integrator: input.adapter,
      resolvesIntegrationId: previous.id,
      selection,
      sources: this.sourceWorkers(workers, selection)
    })
  }

  private async attempt(branchClass: string, plan: AttemptPlan): Promise<IntegrationRunResult> {
    const { goal } = plan
    const started = await this.ports.commandApi.startIntegration({
      baseRef: goal.baseRef,
      baseSha: goal.baseSha,
      goalId: goal.id,
      idempotencyKey: `integration-${goal.id}-${crypto.randomUUID()}`,
      projectId: goal.projectId,
      resolvesIntegrationId: plan.resolvesIntegrationId
    })
    this.emit("integration:started", { attempt: started.attempt, integrationId: started.integrationId })

    let worktree: FactoryWorktreeRecord | undefined
    let completion: IntegrationCompletion
    try {
      worktree = await this.ports.worktrees.prepare({
        attempt: started.attempt,
        baseRef: goal.baseRef,
        baseSha: goal.baseSha,
        branchClass,
        goalId: goal.id,
        role: integrationRole
      })
      completion = await this.compose(plan, started.integrationId, worktree)
    } catch (error) {
      if (worktree !== undefined) {
        await new FactoryGit(worktree.worktreePath).abortMerge()
      }
      completion = {
        aggregateDiff: null,
        artifactDirectory: worktree?.artifactDirectory ?? notCreated,
        branch: worktree?.branch ?? notCreated,
        conflict: null,
        detail: `Integration blocked: ${error instanceof Error ? error.message : String(error)}`.slice(0, 8_000),
        headSha: null,
        mergeOrder: [],
        overlaps: [],
        resolutions: [],
        selection: plan.selection,
        sources: [],
        status: "blocked",
        validationId: null,
        worktreePath: worktree?.worktreePath ?? notCreated
      }
    }
    await this.ports.commandApi.completeIntegration(started.integrationId, completion)
    this.emit("integration:completed", { integrationId: started.integrationId, status: completion.status })
    return { attempt: started.attempt, completion, integrationId: started.integrationId }
  }

  private selection(
    workers: readonly CommandWorkerSnapshot[],
    excludeWorkerIds: readonly string[],
    rationale: string | undefined
  ): IntegrationSelection | null {
    if (excludeWorkerIds.length === 0) {
      return null
    }
    if (rationale === undefined || rationale.trim().length === 0) {
      throw new IntegrationPreconditionError("Excluding worker output requires a selection rationale")
    }
    const excluded = new Set(excludeWorkerIds)
    for (const workerId of excluded) {
      const worker = workers.find((candidate) => candidate.id === workerId)
      if (worker === undefined || worker.role === integratorRole) {
        throw new IntegrationPreconditionError(`Excluded worker ${workerId} is not a source worker of this goal`)
      }
    }
    const stranded = workers.filter(
      (worker) => !excluded.has(worker.id) && worker.dependsOnWorkerIds.some((dependency) => excluded.has(dependency))
    )
    if (stranded.length > 0) {
      throw new IntegrationPreconditionError(
        `Excluding these workers strands dependents; exclude them too: ${stranded.map((worker) => `${worker.role} (${worker.id})`).join(", ")}`
      )
    }
    return { excludedWorkerIds: [...excluded], rationale: rationale.trim() }
  }

  private sourceWorkers(workers: readonly CommandWorkerSnapshot[], selection: IntegrationSelection | null): CommandWorkerSnapshot[] {
    const excluded = new Set(selection?.excludedWorkerIds ?? [])
    const candidates = workers.filter((worker) => worker.role !== integratorRole && !excluded.has(worker.id))
    if (candidates.length === 0) {
      throw new IntegrationPreconditionError("Goal has no source workers to integrate")
    }
    const unsettled = candidates.filter((worker) => worker.state !== "completed" && worker.state !== "cancelled")
    if (unsettled.length > 0) {
      throw new IntegrationPreconditionError(
        `Every worker must be completed or cancelled before integration: ${unsettled
          .map((worker) => `${worker.role} (${worker.id}) is ${worker.state}`)
          .join("; ")}`
      )
    }
    const completed = candidates.filter((worker) => worker.state === "completed")
    if (completed.length === 0) {
      throw new IntegrationPreconditionError("Goal has no completed workers to integrate")
    }
    return completed
  }

  private async compose(plan: AttemptPlan, integrationId: string, worktree: FactoryWorktreeRecord): Promise<IntegrationCompletion> {
    const sources: IntegrationSource[] = []
    for (const worker of plan.sources) {
      sources.push(await this.captureSource(worker))
    }
    const order = mergeOrder(plan.sources)
    const resolutions: IntegrationResolution[] = []
    const evidence = {
      artifactDirectory: worktree.artifactDirectory,
      branch: worktree.branch,
      mergeOrder: order,
      overlaps: changedFileOverlaps(sources),
      resolutions,
      selection: plan.selection,
      sources,
      worktreePath: worktree.worktreePath
    }
    const git = new FactoryGit(worktree.worktreePath)
    const merged: CommandWorkerSnapshot[] = []
    for (const workerId of order) {
      const source = sources.find((candidate) => candidate.workerId === workerId)
      const worker = plan.sources.find((candidate) => candidate.id === workerId)
      if (source === undefined || worker === undefined) {
        throw new Error(`Missing integration source ${workerId}`)
      }
      const resolving = plan.integrator !== null && resolutions.length < maximumResolutions
      const outcome = await git.merge(
        source.commitSha,
        `evergreen: integrate ${source.role} (${source.workerId}) for goal ${plan.goal.id}`,
        { keepConflicts: resolving }
      )
      if (outcome.kind === "conflicted") {
        let detail = `Merging ${source.role} (${workerId}) conflicted on ${outcome.paths.length} path(s); the merge was aborted.`
        if (resolving && plan.integrator !== null && this.ports.integrator !== undefined) {
          const resolved = await this.ports.integrator.resolve({
            adapter: plan.integrator,
            conflicted: worker,
            goal: plan.goal,
            integrationId,
            merged,
            paths: outcome.paths,
            sequence: resolutions.length + 1,
            worktree
          })
          if (resolved.kind === "resolved") {
            resolutions.push(resolved.resolution)
            merged.push(worker)
            this.emit("integration:conflict_resolved", { integrationId, workerId })
            continue
          }
          await git.abortMerge()
          detail = `Merging ${source.role} (${workerId}) conflicted on ${outcome.paths.length} path(s); integrator ${resolved.integratorWorkerId} did not produce an acceptable resolution (${resolved.detail}). The merge was aborted.`
        }
        return {
          ...evidence,
          aggregateDiff: null,
          conflict: { paths: outcome.paths, workerId },
          detail: detail.slice(0, 8_000),
          headSha: await git.head(),
          status: "conflicted",
          validationId: null
        }
      }
      merged.push(worker)
    }

    const headSha = await git.head()
    await mkdir(worktree.artifactDirectory, { recursive: true })
    const patchPath = `${worktree.artifactDirectory}/aggregate.diff`
    const [sha256, stats] = await Promise.all([
      git.writePatch(plan.goal.baseSha, headSha, patchPath),
      git.diffStats(plan.goal.baseSha, headSha)
    ])
    const validation = await this.ports.validation.validate({
      artifactDirectory: `${worktree.artifactDirectory}/validation`,
      goalId: plan.goal.id,
      idempotencyKey: `validation-integration-${integrationId}`,
      projectId: plan.goal.projectId,
      subject: { id: integrationId, type: "integration" },
      worktreePath: worktree.worktreePath
    })
    const resolvedNote = resolutions.length === 0 ? "" : ` ${resolutions.length} conflict(s) resolved by the integrator.`
    return {
      ...evidence,
      aggregateDiff: {
        deletions: stats.deletions,
        filesChanged: stats.changedFiles.length,
        insertions: stats.insertions,
        path: patchPath,
        sha256
      },
      conflict: null,
      detail: `Integrated ${sources.length} worker(s);${resolvedNote} validation ${validation.status} on ${headSha}.`,
      headSha,
      status: validation.status === "passed" ? "validated" : "validation_failed",
      validationId: validation.validationId
    }
  }

  private async captureSource(worker: CommandWorkerSnapshot): Promise<IntegrationSource> {
    const git = new FactoryGit(worker.worktree.worktreePath)
    const branch = await git.currentBranch()
    if (branch !== worker.worktree.branch) {
      throw new Error(`Worker ${worker.id} worktree is on ${branch || "a detached HEAD"}, not ${worker.worktree.branch}`)
    }
    const captureCommitSha = await git.captureWorkerOutput(`evergreen: capture output of ${worker.role} (${worker.id})`)
    const commitSha = await git.head()
    const stats = await git.diffStats(worker.worktree.baseSha, commitSha)
    return {
      branch,
      captureCommitSha,
      changedFiles: stats.changedFiles,
      commitSha,
      deletions: stats.deletions,
      insertions: stats.insertions,
      role: worker.role,
      workerId: worker.id
    }
  }
}
