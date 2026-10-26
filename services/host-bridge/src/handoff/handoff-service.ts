/** @module Governed GitHub handoff: request an approved plan, then execute exactly that plan. */

import { createHash } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import type { HandoffResult } from "@evergreen-terrace/contracts"
import type { CommandHandoffSnapshot } from "../command-api/command-api-client.types"
import { FactoryGit } from "../git/factory-git"
import { renderHandoffBody, renderSupersedeComment, supersedeMarker } from "./handoff-body"
import { assertHandoffPolicy } from "./handoff-policy"
import type { HandoffExecutionOutcome, HandoffRequestOutcome, HandoffServicePorts } from "./handoff-service.types"

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export class HandoffService {
  constructor(private readonly ports: HandoffServicePorts) {}

  /**
   * Records a push-and-PR plan for a validated integration together with an
   * `external_side_effect` decision card. It never contacts GitHub.
   */
  async request(integrationId: string): Promise<HandoffRequestOutcome> {
    const { commandApi } = this.ports
    const integration = await commandApi.getIntegration(integrationId)
    const completion = integration.completion
    if (
      integration.status !== "validated" ||
      completion === null ||
      completion.headSha === null ||
      completion.validationId === null
    ) {
      throw new Error(`Only a validated integration can be handed off; integration is ${integration.status}`)
    }
    const target = assertHandoffPolicy(await this.ports.loadPolicy(), {
      baseRef: integration.baseRef,
      branch: completion.branch
    })
    const git = new FactoryGit(completion.worktreePath)
    if ((await git.currentBranch()) !== completion.branch || (await git.head()) !== completion.headSha || !(await git.isClean())) {
      throw new Error("The integration worktree moved since validation; run a new integration attempt")
    }

    const goal = await commandApi.getGoal(integration.goalId)
    const validation = await commandApi.findValidation(goal.id, completion.validationId)
    const previous = (await commandApi.listGoalHandoffs(goal.id)).filter((handoff) => handoff.result !== null).at(-1)
    const plan = {
      baseRef: integration.baseRef,
      branch: completion.branch,
      headSha: completion.headSha,
      remote: target.remote,
      repository: target.repository,
      supersedesPullRequest: previous?.result?.pullRequest.number ?? null,
      title: goal.title.slice(0, 240)
    }
    const body = renderHandoffBody({
      attempt: integration.attempt,
      baseRef: integration.baseRef,
      baseSha: integration.baseSha,
      completion,
      goal,
      integrationId: integration.id,
      validation
    })
    const requested = await commandApi.requestHandoff({
      body,
      idempotencyKey: `handoff-${integration.id}`,
      integrationId: integration.id,
      plan
    })
    return { created: requested.created, decisionId: requested.decisionId, handoffId: requested.handoffId, plan }
  }

  /**
   * Executes an approved plan. The command API moves the handoff to
   * `executing` before any side effect. Each step first observes GitHub, so a
   * retry after a crash reconciles finished steps instead of repeating them.
   */
  async execute(handoffId: string): Promise<HandoffExecutionOutcome> {
    const { commandApi } = this.ports
    const handoff = await commandApi.getHandoff(handoffId)
    if (handoff.status === "completed" && handoff.result !== null) {
      return { handoffId, result: handoff.result, status: "completed" }
    }
    const begun = await commandApi.beginHandoff(handoffId)
    if (begun.status === "declined") {
      return { handoffId, status: "declined" }
    }
    if (begun.status !== "executing") {
      throw new Error(`Handoff ${handoffId} cannot execute from ${begun.status}`)
    }
    try {
      const result = await this.perform(handoff)
      const detail = result.reconciledSteps.length === 0 ? "Pushed and opened the pull request." : `Recovered; already done: ${result.reconciledSteps.join(", ")}.`
      await commandApi.completeHandoff(handoffId, { detail, result, status: "completed" })
      return { handoffId, result, status: "completed" }
    } catch (error) {
      const detail = `Handoff failed: ${message(error)}`.slice(0, 8_000)
      await commandApi.completeHandoff(handoffId, { detail, status: "failed" })
      return { detail, handoffId, status: "failed" }
    }
  }

  private async perform(handoff: CommandHandoffSnapshot): Promise<HandoffResult> {
    const { plan } = handoff
    const target = assertHandoffPolicy(await this.ports.loadPolicy(), { baseRef: plan.baseRef, branch: plan.branch })
    if (target.remote !== plan.remote || target.repository !== plan.repository) {
      throw new Error("Project policy no longer matches the approved remote or repository")
    }
    if (createHash("sha256").update(handoff.body).digest("hex") !== plan.bodySha256) {
      throw new Error("Stored pull request body does not match the approved digest")
    }
    const integration = await this.ports.commandApi.getIntegration(handoff.integrationId)
    if (integration.completion === null) {
      throw new Error(`Integration ${handoff.integrationId} has no completion evidence`)
    }
    const git = new FactoryGit(integration.completion.worktreePath)
    const directory = join(this.ports.workDirectory, handoff.id)
    await mkdir(directory, { recursive: true })
    const reconciledSteps: HandoffResult["reconciledSteps"] = []

    if ((await git.remoteBranchSha(plan.remote, plan.branch)) === plan.headSha) {
      reconciledSteps.push("push")
    } else {
      await git.pushCommit(plan.remote, plan.headSha, plan.branch)
      if ((await git.remoteBranchSha(plan.remote, plan.branch)) !== plan.headSha) {
        throw new Error(`Remote ${plan.remote}/${plan.branch} does not point at ${plan.headSha} after push`)
      }
    }

    let pullRequest = await this.ports.github.findOpenPullRequest(plan.repository, plan.branch)
    if (pullRequest === null) {
      const bodyPath = join(directory, "pull-request.md")
      await Bun.write(bodyPath, handoff.body)
      pullRequest = await this.ports.github.createPullRequest(plan.repository, {
        base: plan.baseRef,
        bodyPath,
        head: plan.branch,
        title: plan.title
      })
    } else {
      reconciledSteps.push("pull_request")
    }

    let supersedeCommentUrl: string | null = null
    if (plan.supersedesPullRequest !== null) {
      const marker = supersedeMarker(handoff.id)
      supersedeCommentUrl = await this.ports.github.findCommentContaining(plan.repository, plan.supersedesPullRequest, marker)
      if (supersedeCommentUrl === null) {
        const commentPath = join(directory, "supersede-comment.md")
        await Bun.write(commentPath, renderSupersedeComment(handoff.id, pullRequest.url))
        supersedeCommentUrl = await this.ports.github.commentOnPullRequest(plan.repository, plan.supersedesPullRequest, commentPath)
      } else {
        reconciledSteps.push("supersede_comment")
      }
    }

    return { pullRequest, pushedSha: plan.headSha, reconciledSteps, supersedeCommentUrl }
  }
}
