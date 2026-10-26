/** @module Integrator agent: resolves one open merge conflict, verified and committed by the host. */

import { createHash } from "node:crypto"
import type { IntegrationResolution } from "@evergreen-terrace/contracts"
import { integratorRole } from "@evergreen-terrace/project-policy"
import { FactoryGit } from "../git/factory-git"
import { finalAgentMessage } from "../workers/acp-transcript"
import { renderIntegratorBrief } from "./integrator-brief"
import type { ConflictIntegratorPorts, ConflictResolutionInput, ConflictResolutionOutcome } from "./conflict-integrator.types"

/**
 * Runs an ACP integrator worker inside the integration worktree while a merge
 * is open. The worker goes through the normal scheduler: brief, lease, and
 * decision cards for each edit. Its completion is not trusted. The host
 * verifies, before committing, that:
 *
 * - the merge is still open (the agent did not commit or abort it);
 * - no conflict markers remain in the conflicted files;
 * - only conflicted files changed, and no files were added.
 */
export class ConflictIntegrator {
  constructor(private readonly ports: ConflictIntegratorPorts) {}

  async resolve(input: ConflictResolutionInput): Promise<ConflictResolutionOutcome> {
    const { worktree } = input
    const artifactDirectory = `${worktree.artifactDirectory}/integrator-${input.sequence}`
    const assigned = await this.ports.commandApi.assignWorker({
      adapter: input.adapter,
      dependsOnWorkerIds: [],
      goalId: input.goal.id,
      idempotencyKey: `integrator-${input.integrationId}-${input.sequence}`,
      projectId: input.goal.projectId,
      role: integratorRole,
      worktree: {
        artifactDirectory,
        attempt: worktree.attempt,
        baseRef: worktree.baseRef,
        baseSha: worktree.baseSha,
        branch: worktree.branch,
        manifestPath: worktree.manifestPath,
        worktreePath: worktree.worktreePath
      }
    })
    const brief = async (workerId: string) => (await this.ports.commandApi.getWorkerBrief(workerId)).prompt
    const prompt = renderIntegratorBrief({
      conflicted: { brief: await brief(input.conflicted.id), role: input.conflicted.role },
      goalTitle: input.goal.title,
      merged: await Promise.all(input.merged.map(async (source) => ({ brief: await brief(source.id), role: source.role }))),
      paths: input.paths
    })
    await this.ports.scheduler.recordBriefs([{ prompt, workerId: assigned.workerId }])
    const schedule = await this.ports.scheduler.start({
      goalId: input.goal.id,
      maxConcurrency: 1,
      workerIds: [assigned.workerId]
    }).completion
    const outcome = schedule.outcomes.find((candidate) => candidate.workerId === assigned.workerId)
    const failure = (detail: string): ConflictResolutionOutcome => ({ detail, integratorWorkerId: assigned.workerId, kind: "failed" })
    if (outcome?.state !== "completed") {
      return failure(`Integrator worker did not complete: ${outcome?.detail ?? "no outcome"}`)
    }

    const git = new FactoryGit(worktree.worktreePath)
    if (!(await git.mergeInProgress())) {
      return failure("The integrator changed the merge state (committed or aborted); its result is discarded")
    }
    const marked = await git.filesWithConflictMarkers(input.paths)
    if (marked.length > 0) {
      return failure(`Conflict markers remain in: ${marked.join(", ")}`)
    }
    const allowed = new Set(input.paths)
    const outOfScope = (await git.unstagedPaths()).filter((path) => !allowed.has(path))
    const added = await git.untrackedPaths()
    if (outOfScope.length > 0 || added.length > 0) {
      return failure(
        `The integrator worked outside its scope claim: changed ${outOfScope.join(", ") || "none"}; added ${added.join(", ") || "none"}`
      )
    }

    const rationale = (await finalAgentMessage(`${artifactDirectory}/acp.events.ndjson`)).slice(0, 8_000)
    const resolvedCommitSha = await git.commitResolvedMerge(
      input.paths,
      `evergreen: integrate ${input.conflicted.role} (${input.conflicted.id}) for goal ${input.goal.id}; conflicts resolved by integrator ${assigned.workerId}`
    )
    if ((await git.parents(resolvedCommitSha)).length !== 2) {
      return failure(`Resolved commit ${resolvedCommitSha} is not a two-parent merge`)
    }
    const resolution: IntegrationResolution = {
      conflictedWorkerId: input.conflicted.id,
      integratorWorkerId: assigned.workerId,
      paths: [...input.paths],
      rationale,
      rationaleSha256: createHash("sha256").update(rationale).digest("hex"),
      resolvedCommitSha
    }
    return { kind: "resolved", resolution }
  }
}
