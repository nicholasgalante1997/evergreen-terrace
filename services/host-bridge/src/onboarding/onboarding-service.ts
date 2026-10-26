/** @module Repository onboarding: cited read-only discovery, one approval packet, and a factory-branch policy commit. */

import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { discoveryReportSchema, onboardingProposalSchema } from "@evergreen-terrace/contracts"
import type {
  OnboardingFacts,
  OnboardingPacket,
  OnboardingProposal,
  VerifiedDiscoveryReport
} from "@evergreen-terrace/contracts"
import { isProtectedBranch, parseProjectPolicy } from "@evergreen-terrace/project-policy"
import type { CommandOnboardingSnapshot } from "../command-api/command-api-client.types"
import { FactoryGit } from "../git/factory-git"
import { runStructuredSession } from "../planning/structured-output"
import { runProcess } from "../process/run-process"
import { validationPlan } from "../validation/validation-service"
import { projectSegment } from "../worktrees/worktree-paths"
import { unverifiedCitations } from "./citation-check"
import type { CitationIndex } from "./citation-check"
import { consolidationPrompt, discoveryAssignments, discoveryPrompt } from "./discovery-brief"
import { composePolicy, proposedPolicyToml } from "./policy-config"
import type {
  OnboardingApplyOutcome,
  OnboardingDiscoverInput,
  OnboardingDiscoverOutcome,
  OnboardingDiscoverStarted,
  OnboardingServicePorts
} from "./onboarding-service.types"

export class OnboardingPreconditionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OnboardingPreconditionError"
  }
}

const policyPath = ".et/config.toml"

const latestOnboarding = (onboardings: readonly CommandOnboardingSnapshot[]): CommandOnboardingSnapshot | undefined =>
  [...onboardings].sort((left, right) => left.revision - right.revision).at(-1)

/**
 * Discovery records intent first, then runs two to four independent read-only
 * agents and one mayor consolidation, each in its own detached checkout of the
 * base commit. The host verifies every file citation, composes the policy
 * itself, and records one packet with one decision card. Applying an approved
 * packet commits exactly the approved text on a new factory branch; it never
 * touches the active checkout or a protected branch, and never pushes.
 */
export class OnboardingService {
  readonly #discovering = new Set<string>()

  constructor(private readonly ports: OnboardingServicePorts) {}

  async discover(input: OnboardingDiscoverInput): Promise<OnboardingDiscoverStarted> {
    const { commandApi } = this.ports
    const { facts, trackedFiles } = await this.ports.facts.collect({
      ...(input.baseRef === undefined ? {} : { baseRef: input.baseRef }),
      remote: input.remote
    })
    let latest = latestOnboarding(await commandApi.listProjectOnboardings(facts.projectId))
    if (latest?.status === "discovering") {
      if (this.#discovering.has(latest.id)) {
        throw new OnboardingPreconditionError(`Onboarding ${latest.id} is already discovering`)
      }
      await commandApi.completeOnboardingDiscovery(latest.id, {
        detail: "Discovery was interrupted (bridge restart). It is not resumed or replayed.",
        status: "failed"
      })
      latest = await commandApi.getOnboarding(latest.id)
    }
    if (latest?.status === "applying") {
      throw new OnboardingPreconditionError(
        `Onboarding ${latest.id} is applying; finish it with evergreen.onboarding.apply`
      )
    }
    const feedback = [await this.revisionNote(latest), input.feedback?.trim() ?? ""]
      .filter((note) => note.length > 0)
      .join("\n")
    const sessionId = crypto.randomUUID()
    const assignments = discoveryAssignments(input.workers)
    const checkouts = await Promise.all(
      [...assignments.map((assignment) => assignment.key), "mayor"].map(async (key) => ({
        key,
        ...(await this.ports.checkouts.create({
          baseSha: facts.baseSha,
          key,
          ownerId: sessionId,
          projectId: facts.projectId,
          purpose: "onboarding"
        }))
      }))
    )
    const checkout = (key: string) => {
      const found = checkouts.find((candidate) => candidate.key === key)
      if (found === undefined) {
        throw new Error(`Missing checkout ${key}`)
      }
      return found
    }
    const started = await commandApi.startOnboarding({
      discovery: {
        adapter: input.adapter,
        baseRef: facts.baseRef,
        baseSha: facts.baseSha,
        workers: assignments.map((assignment) => ({
          areas: assignment.areas,
          artifactDirectory: checkout(assignment.key).artifactDirectory,
          checkoutPath: checkout(assignment.key).checkoutPath,
          key: assignment.key
        }))
      },
      feedback: feedback.slice(0, 8_000),
      idempotencyKey: input.idempotencyKey ?? `onboarding-${sessionId}`,
      projectId: facts.projectId,
      revisionOf: latest?.id ?? null
    })
    if (!started.created) {
      const existing = await commandApi.getOnboarding(started.onboardingId)
      return {
        completion: Promise.resolve(this.outcome(existing)),
        onboardingId: existing.id,
        projectId: facts.projectId,
        revision: existing.revision
      }
    }
    this.#discovering.add(started.onboardingId)
    const index: CitationIndex = { lineCount: (path) => this.ports.facts.lineCount(facts.baseSha, path), trackedFiles }
    const completion = this.runDiscovery({
      adapter: input.adapter,
      assignments,
      checkout,
      facts,
      feedback,
      index,
      onboardingId: started.onboardingId
    }).finally(() => this.#discovering.delete(started.onboardingId))
    completion.catch(() => undefined)
    return { completion, onboardingId: started.onboardingId, projectId: facts.projectId, revision: started.revision }
  }

  async apply(input: { onboardingId: string; validate: boolean }): Promise<OnboardingApplyOutcome> {
    const { commandApi } = this.ports
    const begun = await commandApi.beginOnboardingApply(input.onboardingId)
    const onboarding = await commandApi.getOnboarding(input.onboardingId)
    if (begun.status === "declined") {
      return { detail: onboarding.detail, onboardingId: onboarding.id, status: "declined" }
    }
    if (begun.status === "applied" && onboarding.result !== null) {
      return { detail: onboarding.detail, onboardingId: onboarding.id, result: onboarding.result, status: "applied" }
    }
    try {
      const result = await this.commitPolicy(onboarding, input.validate)
      const detail = `Committed ${policyPath} on ${result.branch} at ${result.commitSha}.${
        result.validation === null ? "" : ` Validation ${result.validation.status}.`
      } Review the branch and merge it into ${onboarding.packet?.facts.baseRef ?? "the base"} to finish onboarding.`
      await commandApi.completeOnboardingApply(onboarding.id, { detail, result, status: "applied" })
      return { detail, onboardingId: onboarding.id, result, status: "applied" }
    } catch (error) {
      const detail = `Applying failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 8_000)
      await commandApi.completeOnboardingApply(onboarding.id, { detail, status: "failed" })
      return { detail, onboardingId: onboarding.id, status: "failed" }
    }
  }

  private async commitPolicy(onboarding: CommandOnboardingSnapshot, validate: boolean) {
    const packet = onboarding.packet
    if (packet === null) {
      throw new Error(`Onboarding ${onboarding.id} has no packet`)
    }
    if (createHash("sha256").update(packet.configToml).digest("hex") !== packet.configSha256) {
      throw new Error("The recorded policy text does not match its approved digest")
    }
    const policy = parseProjectPolicy(packet.configToml)
    const branchClass = policy.branches.classes[0]
    if (branchClass === undefined) {
      throw new Error("The approved policy has no branch class")
    }
    const branch = `${branchClass.prefix}et-onboarding-${onboarding.id.slice(0, 8)}`
    if (isProtectedBranch(policy, branch)) {
      throw new Error(`The onboarding branch would be protected: ${branch}`)
    }
    const project = projectSegment(onboarding.projectId)
    const worktreePath = join(this.ports.factoryRoot, "worktrees", project, "onboarding", onboarding.id)
    const artifactDirectory = join(this.ports.factoryRoot, "artifacts", project, "onboarding", onboarding.id, "apply")
    if (!(await Bun.file(join(worktreePath, ".git")).exists())) {
      await mkdir(join(this.ports.factoryRoot, "worktrees", project, "onboarding"), { recursive: true })
      await runProcess(["git", "worktree", "add", "--detach", worktreePath, packet.facts.baseSha], this.ports.projectRoot)
      await runProcess(["git", "switch", "--create", branch], worktreePath)
    }
    const git = new FactoryGit(worktreePath)
    if ((await git.currentBranch()) !== branch) {
      throw new Error(`Onboarding worktree ${worktreePath} is not on ${branch}`)
    }
    await mkdir(join(worktreePath, ".et"), { recursive: true })
    await writeFile(join(worktreePath, policyPath), packet.configToml)
    await git.captureWorkerOutput(
      `evergreen: onboard ${onboarding.projectId}\n\nCommits ${policyPath} approved in onboarding ${onboarding.id}.`
    )
    const commitSha = await git.head()
    const changed = (await git.diffStats(packet.facts.baseSha, commitSha)).changedFiles
    if (changed.length !== 1 || changed[0] !== policyPath) {
      throw new Error(`The onboarding branch changes more than ${policyPath}: ${changed.join(", ")}`)
    }
    let validation = null
    if (validate) {
      await mkdir(join(artifactDirectory, "validation"), { recursive: true })
      const run = await this.ports.validation.run({
        artifactDirectory: join(artifactDirectory, "validation"),
        plan: validationPlan(policy),
        worktreePath
      })
      validation = {
        artifactDirectory: join(artifactDirectory, "validation"),
        commands: run.results.map((result) => ({
          command: result.command,
          exitCode: result.exitCode,
          timedOut: result.timedOut
        })),
        status: run.status
      }
    }
    return { branch, commitSha, validation, worktreePath }
  }

  private async runDiscovery(input: {
    adapter: OnboardingDiscoverInput["adapter"]
    assignments: ReturnType<typeof discoveryAssignments>
    checkout: (key: string) => { artifactDirectory: string; checkoutPath: string }
    facts: OnboardingFacts
    feedback: string
    index: CitationIndex
    onboardingId: string
  }): Promise<OnboardingDiscoverOutcome> {
    const { commandApi } = this.ports
    try {
      const reports: VerifiedDiscoveryReport[] = await Promise.all(
        input.assignments.map(async (assignment) => {
          const checkout = input.checkout(assignment.key)
          const outcome = await runStructuredSession(
            this.ports.agent,
            {
              adapter: input.adapter,
              artifactDirectory: checkout.artifactDirectory,
              checkoutPath: checkout.checkoutPath,
              label: `discovery:${input.onboardingId}:${assignment.key}`,
              prompt: discoveryPrompt({ assignment, facts: input.facts, feedback: input.feedback })
            },
            discoveryReportSchema
          )
          return {
            areas: assignment.areas,
            artifactDirectory: checkout.artifactDirectory,
            failure: outcome.ok ? null : outcome.detail.slice(0, 4_000),
            key: assignment.key,
            report: outcome.ok ? outcome.value : null,
            unverifiedCitations: outcome.ok
              ? (
                  await unverifiedCitations(
                    outcome.value.findings.flatMap((finding) => finding.citations),
                    input.index
                  )
                ).slice(0, 320)
              : []
          }
        })
      )
      if (reports.every((report) => report.report === null)) {
        throw new Error(
          `Every discovery agent failed: ${reports.map((report) => `${report.key}: ${report.failure}`).join("; ")}`
        )
      }
      const existing = input.facts.existingPolicy ? await this.ports.committedPolicy(input.facts.baseSha) : null
      const mayor = input.checkout("mayor")
      const consolidated = await runStructuredSession(
        this.ports.agent,
        {
          adapter: input.adapter,
          artifactDirectory: mayor.artifactDirectory,
          checkoutPath: mayor.checkoutPath,
          label: `mayor:onboarding:${input.onboardingId}`,
          prompt: consolidationPrompt({ existing, facts: input.facts, feedback: input.feedback, reports })
        },
        onboardingProposalSchema,
        (proposal) => this.proposalIssues(proposal, input.facts)
      )
      if (!consolidated.ok) {
        throw new Error(consolidated.detail)
      }
      const proposalUnverified = await unverifiedCitations(
        [
          ...consolidated.value.validationEvidence.flatMap((entry) => entry.citations),
          ...consolidated.value.risks.flatMap((risk) => risk.citations)
        ],
        input.index
      )
      if (proposalUnverified.length > 0) {
        throw new Error(
          `The consolidated proposal cites files that do not exist at the base: ${proposalUnverified.join(", ")}`
        )
      }
      const configToml = proposedPolicyToml(composePolicy(input.facts, consolidated.value, existing))
      const packet: OnboardingPacket = {
        configSha256: createHash("sha256").update(configToml).digest("hex"),
        configToml,
        discovery: reports,
        facts: input.facts,
        proposal: consolidated.value
      }
      await writeFile(join(mayor.artifactDirectory, "packet.json"), `${JSON.stringify(packet, null, 2)}\n`)
      await commandApi.completeOnboardingDiscovery(input.onboardingId, { packet, status: "proposed" })
    } catch (error) {
      await commandApi
        .completeOnboardingDiscovery(input.onboardingId, {
          detail: `Discovery failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 8_000),
          status: "failed"
        })
        .catch(() => undefined)
    }
    return this.outcome(await commandApi.getOnboarding(input.onboardingId))
  }

  /** Every check and setup step needs cited evidence, and base refs must exist locally. */
  private proposalIssues(proposal: OnboardingProposal, facts: OnboardingFacts): string[] {
    const evidenced = new Set(proposal.validationEvidence.map((entry) => entry.command))
    return [
      ...[...proposal.validation.setup, ...proposal.validation.commands]
        .filter((command) => !evidenced.has(command))
        .map((command) => `validationEvidence: add cited evidence for "${command}", or drop it`),
      ...proposal.allowedBaseRefs
        .filter((ref) => !facts.localBranches.includes(ref))
        .map((ref) => `allowedBaseRefs: ${ref} is not a local branch`)
    ]
  }

  private async revisionNote(latest: CommandOnboardingSnapshot | undefined): Promise<string> {
    if (latest?.decisionId === null || latest?.decisionId === undefined) {
      return ""
    }
    const decision = await this.ports.commandApi.getDecision(latest.decisionId)
    const note = decision.resolution?.note.trim() ?? ""
    return decision.status === "requested" || note.length === 0 ? "" : `Revision request: ${note}`
  }

  private outcome(onboarding: CommandOnboardingSnapshot): OnboardingDiscoverOutcome {
    return {
      decisionId: onboarding.decisionId,
      detail: onboarding.detail,
      onboardingId: onboarding.id,
      status: onboarding.status
    }
  }
}
