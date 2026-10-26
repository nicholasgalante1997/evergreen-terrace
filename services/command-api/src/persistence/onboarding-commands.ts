/** @module Repository-onboarding command transactions: one approval packet, one decision. */

import { createHash } from "node:crypto"
import { createOnboardingUpdatedEvent } from "@evergreen-terrace/contracts"
import type {
  DecisionRequest,
  EventEnvelope,
  OnboardingApplyCompletion,
  OnboardingDiscoveryCompletion,
  OnboardingPacket,
  OnboardingStart
} from "@evergreen-terrace/contracts"
import type { SQL } from "bun"
import { boundedContext, createDecisionCard } from "./decision-card"
import { DecisionRepository } from "./decision-repository"
import { EventStore } from "./event-store"
import { EvidenceConflictError, EvidenceNotFoundError } from "./evidence-error"
import { OnboardingRepository } from "./onboarding-repository"
import { OutboxRepository } from "./outbox-repository"
import type { OnboardingBeginApplyResult, OnboardingCommandResult } from "./command-database.types"
import type { OnboardingChange, OnboardingRecord } from "./onboarding-repository.types"

const actor = { id: "command-api", kind: "system" } as const

/** The option an engineer must select for the policy to be committed. */
export const onboardingApproveOptionId = "approve"
export const onboardingReviseOptionId = "revise"

const payload = (onboarding: OnboardingRecord) => ({
  decisionId: onboarding.decisionId,
  detail: onboarding.detail,
  discovery: onboarding.discovery,
  id: onboarding.id,
  packet: onboarding.packet,
  projectId: onboarding.projectId,
  result: onboarding.result,
  revision: onboarding.revision,
  revisionOf: onboarding.revisionOf,
  status: onboarding.status
})

const bullets = (items: readonly string[]): string[] => items.map((item) => `- ${item}`)

/** The card carries the exact `.et/config.toml`; approval commits exactly that text and nothing else. */
export const onboardingDecision = (onboarding: OnboardingRecord, packet: OnboardingPacket): DecisionRequest => {
  const { facts, proposal } = packet
  const unverified = packet.discovery.reduce((total, report) => total + report.unverifiedCitations.length, 0)
  const failed = packet.discovery.filter((report) => report.report === null)
  return {
    category: "onboarding",
    context: boundedContext(
      [
        `Onboarding ${onboarding.id} (revision ${onboarding.revision}) for ${facts.projectId}.`,
        `Remote ${facts.remote.name}: ${facts.remote.url}`,
        `Base ${facts.baseRef} at ${facts.baseSha}; active checkout on ${facts.activeBranch || "a detached HEAD"} at ${facts.headSha}.`,
        `${facts.existingPolicy ? "A .et/config.toml already exists at the base; this replaces it." : "No .et/config.toml exists at the base."}`,
        "",
        `Approving commits exactly this .et/config.toml (SHA-256 ${packet.configSha256}) on a new factory branch.`,
        "It never touches the active checkout or a protected branch. Merging it is the engineer's action.",
        "",
        "```toml",
        packet.configToml.trimEnd(),
        "```",
        "",
        `Discovery: ${packet.discovery.length} read-only agent(s); ${unverified} citation(s) could not be verified at the base commit.`,
        ...failed.map((report) => `- ${report.key} returned no usable report: ${report.failure ?? "unknown"}`),
        ...(proposal.validationEvidence.length === 0
          ? []
          : [
              "Validation evidence:",
              ...proposal.validationEvidence.map(
                (entry) =>
                  `- ${entry.command}: ${entry.citations.map((citation) => (citation.kind === "file" ? `${citation.path}${citation.line === null ? "" : `:${citation.line}`}` : `\`${citation.command}\``)).join(", ")}`
              )
            ]),
        ...(proposal.risks.length === 0
          ? []
          : ["Risks:", ...proposal.risks.map((risk) => `- [${risk.category}] ${risk.detail}`)]),
        ...(proposal.ambiguities.length === 0
          ? []
          : [
              "Unresolved ambiguities (answer in the resolution note and request a revision):",
              ...proposal.ambiguities.map(
                (entry) => `- ${entry.question}${entry.detail.length === 0 ? "" : ` ${entry.detail}`}`
              )
            ]),
        ...(proposal.moduleMap.length === 0
          ? []
          : ["Module map:", ...proposal.moduleMap.map((entry) => `- ${entry.path}: ${entry.purpose}`)]),
        ...(proposal.profile.projectConventions.length === 0
          ? []
          : ["Project conventions:", ...bullets(proposal.profile.projectConventions)]),
        ...(proposal.profile.candidateGlobalPreferences.length === 0
          ? []
          : [
              "Candidate global preferences (not promoted by this decision):",
              ...bullets(proposal.profile.candidateGlobalPreferences)
            ])
      ],
      "Read the full packet with evergreen.onboarding.status."
    ),
    goalId: null,
    idempotencyKey: `onboarding-${onboarding.id}`,
    options: [
      {
        detail: "Commit this .et/config.toml on a factory branch and validate it.",
        id: onboardingApproveOptionId,
        label: "Commit policy"
      },
      {
        detail: "Do not commit. Discovery runs again; write the requested change in the resolution note.",
        id: onboardingReviseOptionId,
        label: "Request a revision"
      },
      { detail: "Do not commit this policy.", id: "reject", label: "Reject" }
    ],
    projectId: onboarding.projectId,
    recommendedOptionId: null,
    title: `Onboard ${facts.projectId} with the proposed .et policy`.slice(0, 240)
  }
}

export class OnboardingCommands {
  readonly #decisions: DecisionRepository
  readonly #events: EventStore
  readonly #onboardings: OnboardingRepository
  readonly #outbox: OutboxRepository

  constructor(transaction: SQL) {
    this.#decisions = new DecisionRepository(transaction)
    this.#events = new EventStore(transaction)
    this.#onboardings = new OnboardingRepository(transaction)
    this.#outbox = new OutboxRepository(transaction)
  }

  /** Records intent before any discovery agent starts. One onboarding runs per project at a time. */
  async start(input: OnboardingStart): Promise<OnboardingCommandResult> {
    const replay = await this.#onboardings.findByIdempotency(input.projectId, input.idempotencyKey)
    if (replay !== undefined) {
      return { created: false, onboardingId: replay.id, revision: replay.revision, status: replay.status }
    }
    await this.#onboardings.lockProject(input.projectId)
    const latest = await this.#onboardings.findLatestForProject(input.projectId)
    if ((latest?.id ?? null) !== input.revisionOf) {
      throw new EvidenceConflictError(
        latest === undefined
          ? "The project has no onboarding yet; revisionOf must be null"
          : `A new onboarding must revise the latest one, ${latest.id} (revision ${latest.revision})`
      )
    }
    if (latest !== undefined) {
      await this.assertRevisable(latest)
    }
    const onboardingId = crypto.randomUUID()
    const record: OnboardingRecord = {
      createdAt: new Date(),
      decisionId: null,
      detail: "",
      discovery: input.discovery,
      feedback: input.feedback,
      id: onboardingId,
      idempotencyKey: input.idempotencyKey,
      lastEventId: "",
      packet: null,
      projectId: input.projectId,
      result: null,
      revision: (latest?.revision ?? 0) + 1,
      revisionOf: input.revisionOf,
      sequence: 1,
      status: "discovering",
      updatedAt: new Date()
    }
    const event = createOnboardingUpdatedEvent({
      actor: { id: "mayor", kind: "mayor" },
      causationId: latest?.lastEventId ?? null,
      correlationId: crypto.randomUUID(),
      onboarding: payload(record),
      sequence: 1
    })
    await this.#onboardings.create({ ...record, lastEventId: event.eventId })
    await this.publish(event)
    return { created: true, onboardingId, revision: record.revision, status: "discovering" }
  }

  async completeDiscovery(
    onboardingId: string,
    completion: OnboardingDiscoveryCompletion
  ): Promise<OnboardingCommandResult> {
    const onboarding = await this.lock(onboardingId)
    if (onboarding.status !== "discovering") {
      const settled = completion.status === "failed" ? onboarding.status === "failed" : onboarding.status === "proposed"
      if (settled) {
        return { created: false, onboardingId, revision: onboarding.revision, status: onboarding.status }
      }
      throw new EvidenceConflictError(`Onboarding ${onboardingId} is ${onboarding.status}, not discovering`)
    }
    if (completion.status === "failed") {
      await this.transition(
        onboarding,
        { ...this.unchanged(onboarding), detail: completion.detail, status: "failed" },
        onboarding.lastEventId,
        []
      )
      return { created: true, onboardingId, revision: onboarding.revision, status: "failed" }
    }
    const { packet } = completion
    if (
      packet.facts.projectId !== onboarding.projectId ||
      packet.facts.baseSha.toLowerCase() !== onboarding.discovery.baseSha.toLowerCase()
    ) {
      throw new EvidenceConflictError("The packet must describe the project and base commit discovery started from")
    }
    if (createHash("sha256").update(packet.configToml).digest("hex") !== packet.configSha256) {
      throw new EvidenceConflictError("configSha256 does not match configToml")
    }
    const card = await createDecisionCard(this.#decisions, onboardingDecision(onboarding, packet), crypto.randomUUID())
    await this.transition(
      onboarding,
      {
        ...this.unchanged(onboarding),
        decisionId: card.decisionId,
        detail: "Awaiting the engineer's approval.",
        packet,
        status: "proposed"
      },
      card.event.eventId,
      [card.event]
    )
    return { created: true, decisionId: card.decisionId, onboardingId, revision: onboarding.revision, status: "proposed" }
  }

  /** Moves an approved packet to `applying` before any Git side effect; any other resolution ends it `declined`. */
  async beginApply(onboardingId: string): Promise<OnboardingBeginApplyResult> {
    const onboarding = await this.lock(onboardingId)
    if (onboarding.status === "applied" || onboarding.status === "declined") {
      return { onboardingId, resumed: false, status: onboarding.status }
    }
    if (onboarding.status === "applying") {
      return { onboardingId, resumed: true, status: "applying" }
    }
    if (onboarding.decisionId === null || (onboarding.status !== "proposed" && onboarding.status !== "failed")) {
      throw new EvidenceConflictError(
        `Onboarding ${onboardingId} is ${onboarding.status}; only a proposed packet can be applied`
      )
    }
    const decision = await this.#decisions.findById(onboarding.decisionId)
    if (decision === undefined) {
      throw new Error(`Onboarding ${onboardingId} references a missing decision`)
    }
    if (decision.status === "requested") {
      throw new EvidenceConflictError(`Onboarding ${onboardingId} is awaiting approval of decision ${decision.id}`)
    }
    const approved = decision.status === "approved" && decision.resolution?.selectedOptionId === onboardingApproveOptionId
    const status = approved ? "applying" : "declined"
    const detail = approved
      ? onboarding.status === "failed"
        ? `Retrying the approved packet after: ${onboarding.detail}`.slice(0, 8_000)
        : "Approved; committing the policy on a factory branch."
      : decision.resolution?.selectedOptionId === onboardingReviseOptionId
        ? `Revision requested: ${decision.resolution.note}`.slice(0, 8_000)
        : `Decision ${decision.id} did not approve the packet.`
    await this.transition(
      onboarding,
      { ...this.unchanged(onboarding), detail, status },
      decision.resolvedEventId ?? onboarding.lastEventId,
      []
    )
    return { onboardingId, resumed: false, status }
  }

  async completeApply(onboardingId: string, completion: OnboardingApplyCompletion): Promise<OnboardingCommandResult> {
    const onboarding = await this.lock(onboardingId)
    if (onboarding.status === completion.status) {
      return { created: false, onboardingId, revision: onboarding.revision, status: onboarding.status }
    }
    if (onboarding.status !== "applying") {
      throw new EvidenceConflictError(`Onboarding ${onboardingId} is ${onboarding.status}, not applying`)
    }
    await this.transition(
      onboarding,
      {
        ...this.unchanged(onboarding),
        detail: completion.detail,
        result: completion.status === "applied" ? completion.result : null,
        status: completion.status
      },
      onboarding.lastEventId,
      []
    )
    return { created: true, onboardingId, revision: onboarding.revision, status: completion.status }
  }

  private async assertRevisable(latest: OnboardingRecord): Promise<void> {
    if (latest.status === "discovering" || latest.status === "applying") {
      throw new EvidenceConflictError(`Onboarding ${latest.id} is still ${latest.status}; fail it before starting again`)
    }
    if (latest.status === "proposed" && latest.decisionId !== null) {
      const decision = await this.#decisions.findById(latest.decisionId)
      if (decision?.status === "requested") {
        throw new EvidenceConflictError(`Onboarding ${latest.id} is awaiting approval of decision ${latest.decisionId}`)
      }
      if (decision?.status === "approved" && decision.resolution?.selectedOptionId === onboardingApproveOptionId) {
        throw new EvidenceConflictError(`Onboarding ${latest.id} is approved; apply it instead of starting again`)
      }
    }
  }

  private unchanged(onboarding: OnboardingRecord): Omit<OnboardingChange, "eventId" | "sequence"> {
    return {
      decisionId: onboarding.decisionId,
      detail: onboarding.detail,
      packet: onboarding.packet,
      result: onboarding.result,
      status: onboarding.status
    }
  }

  private async transition(
    onboarding: OnboardingRecord,
    change: Omit<OnboardingChange, "eventId" | "sequence">,
    causationId: string | null,
    precedingEvents: readonly EventEnvelope[]
  ): Promise<void> {
    const sequence = onboarding.sequence + 1
    const event = createOnboardingUpdatedEvent({
      actor,
      causationId,
      correlationId: precedingEvents[0]?.correlationId ?? crypto.randomUUID(),
      onboarding: payload({ ...onboarding, ...change }),
      sequence
    })
    await this.#onboardings.update(onboarding.id, { ...change, eventId: event.eventId, sequence })
    for (const preceding of precedingEvents) {
      await this.publish(preceding)
    }
    await this.publish(event)
  }

  private async lock(onboardingId: string): Promise<OnboardingRecord> {
    const onboarding = await this.#onboardings.findByIdForUpdate(onboardingId)
    if (onboarding === undefined) {
      throw new EvidenceNotFoundError(`Onboarding not found: ${onboardingId}`)
    }
    return onboarding
  }

  private async publish(event: EventEnvelope): Promise<void> {
    await this.#events.append(event)
    await this.#outbox.enqueue(event)
  }
}
