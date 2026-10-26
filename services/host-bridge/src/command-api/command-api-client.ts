/** @module Authenticated local command API client. */

import {
  decisionRequestSchema,
  decisionResolutionSchema,
  decisionStatusSchema,
  goalSubmissionSchema,
  handoffCompletionSchema,
  handoffPlanSchema,
  handoffRequestSchema,
  handoffResultSchema,
  handoffStatusSchema,
  integrationCompletionSchema,
  integrationStartSchema,
  onboardingApplyCompletionSchema,
  onboardingDiscoveryCompletionSchema,
  onboardingStartSchema,
  onboardingStatusSchema,
  planDraftCompletionSchema,
  planDraftStartSchema,
  planLaunchCompletionSchema,
  planStatusSchema,
  preferenceProposalSchema,
  preferenceStatusSchema,
  validationRecordSchema,
  workerAssignmentSchema,
  workerBriefSchema,
  workerLeaseAcquireSchema,
  workerLeaseReconcileSchema,
  workerLeaseReleaseSchema,
  workerLeaseRenewSchema,
  workerStateChangeSchema,
  workerStateSchema
} from "@evergreen-terrace/contracts"
import type {
  DecisionRequest,
  DecisionResolution,
  GoalSubmission,
  HandoffCompletion,
  HandoffRequest,
  IntegrationCompletionInput,
  IntegrationStartInput,
  OnboardingApplyCompletionInput,
  OnboardingDiscoveryCompletionInput,
  OnboardingStartInput,
  PlanDraftCompletionInput,
  PlanDraftStartInput,
  PlanLaunchCompletion,
  PreferenceProposal,
  ValidationRecord,
  WorkerAssignment
} from "@evergreen-terrace/contracts"
import { z } from "zod"
import {
  commandOnboardingSnapshotSchema,
  commandPlanSnapshotSchema,
  commandPreferenceSnapshotSchema
} from "./command-snapshots"
import type {
  CommandDecisionRequestResult,
  CommandDecisionResolutionResult,
  CommandDecisionSnapshot,
  CommandGoalResult,
  CommandGoalSnapshot,
  CommandHandoffBeginResult,
  CommandHandoffRequestResult,
  CommandHandoffSnapshot,
  CommandIntegrationCompletionResult,
  CommandIntegrationSnapshot,
  CommandIntegrationStartResult,
  CommandOnboardingBeginApplyResult,
  CommandOnboardingResult,
  CommandOnboardingSnapshot,
  CommandPlanBeginLaunchResult,
  CommandPlanResult,
  CommandPlanSnapshot,
  CommandPreferenceResult,
  CommandPreferenceSnapshot,
  CommandValidationResult,
  CommandWorkerAssignmentResult,
  CommandWorkerBrief,
  CommandWorkerBriefResult,
  CommandWorkerLeaseReconcileResult,
  CommandWorkerLeaseResult,
  CommandWorkerStateChangeResult,
  CommandWorkerSnapshot
} from "./command-api-client.types"

export class CommandApiClient {
  constructor(private readonly endpoint: string) {}

  async submitGoal(input: GoalSubmission): Promise<CommandGoalResult> {
    const goal = goalSubmissionSchema.parse(input)
    const response = await fetch(new URL("/v1/goals", this.endpoint), {
      body: JSON.stringify(goal),
      headers: { "content-type": "application/json" },
      method: "POST"
    })
    const payload = (await response.json()) as unknown
    if (!response.ok) {
      throw new Error(`Command API rejected goal submission: ${JSON.stringify(payload)}`)
    }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new Error("Command API returned an invalid goal submission response")
    }
    const result = payload as Record<string, unknown>
    if (typeof result.goalId !== "string" || typeof result.eventId !== "string" || typeof result.created !== "boolean") {
      throw new Error("Command API returned an incomplete goal submission response")
    }

    return { created: result.created, eventId: result.eventId, goalId: result.goalId }
  }

  async requestDecision(input: DecisionRequest): Promise<CommandDecisionRequestResult> {
    const decision = decisionRequestSchema.parse(input)
    const payload = await this.request("/v1/decisions", "POST", decision, "decision request")
    if (
      typeof payload.decisionId !== "string" ||
      typeof payload.eventId !== "string" ||
      typeof payload.created !== "boolean" ||
      payload.status !== "requested"
    ) {
      throw new Error("Command API returned an incomplete decision request response")
    }
    return { created: payload.created, decisionId: payload.decisionId, eventId: payload.eventId, status: payload.status }
  }

  async resolveDecision(decisionId: string, input: DecisionResolution): Promise<CommandDecisionResolutionResult> {
    const resolution = decisionResolutionSchema.parse(input)
    const payload = await this.request(`/v1/decisions/${decisionId}/resolve`, "POST", resolution, "decision resolution")
    if (
      typeof payload.decisionId !== "string" ||
      typeof payload.eventId !== "string" ||
      typeof payload.resolved !== "boolean" ||
      (payload.status !== "approved" && payload.status !== "rejected")
    ) {
      throw new Error("Command API returned an incomplete decision resolution response")
    }
    return {
      decisionId: payload.decisionId,
      eventId: payload.eventId,
      resolved: payload.resolved,
      status: payload.status
    }
  }

  async assignWorker(input: WorkerAssignment): Promise<CommandWorkerAssignmentResult> {
    const worker = workerAssignmentSchema.parse(input)
    const payload = await this.request("/v1/workers", "POST", worker, "worker assignment")
    if (
      typeof payload.workerId !== "string" ||
      typeof payload.eventId !== "string" ||
      typeof payload.created !== "boolean" ||
      payload.state !== "assigned"
    ) {
      throw new Error("Command API returned an incomplete worker assignment response")
    }
    return { created: payload.created, eventId: payload.eventId, state: payload.state, workerId: payload.workerId }
  }

  async getGoal(goalId: string): Promise<CommandGoalSnapshot> {
    const payload = await this.get(`/v1/goals/${goalId}`, "goal")
    if (
      typeof payload.id !== "string" ||
      typeof payload.project_id !== "string" ||
      typeof payload.base_ref !== "string" ||
      typeof payload.base_sha !== "string" ||
      typeof payload.title !== "string"
    ) {
      throw new Error("Command API returned an incomplete goal response")
    }
    const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])
    return {
      baseRef: payload.base_ref,
      baseSha: payload.base_sha.trim(),
      constraints: strings(payload.constraints),
      description: typeof payload.description === "string" ? payload.description : "",
      id: payload.id,
      priorityClass: typeof payload.priority_class === "string" ? payload.priority_class : "",
      projectId: payload.project_id,
      references: strings(payload.references),
      title: payload.title
    }
  }

  async startPlanDraft(input: PlanDraftStartInput): Promise<CommandPlanResult> {
    return this.planResult(await this.request("/v1/plans", "POST", planDraftStartSchema.parse(input), "plan draft"))
  }

  async completePlanDraft(planId: string, input: PlanDraftCompletionInput): Promise<CommandPlanResult> {
    return this.planResult(
      await this.request(
        `/v1/plans/${planId}/draft/complete`,
        "POST",
        planDraftCompletionSchema.parse(input),
        "plan draft completion"
      )
    )
  }

  async beginPlanLaunch(planId: string): Promise<CommandPlanBeginLaunchResult> {
    const payload = await this.request(`/v1/plans/${planId}/launch/begin`, "POST", {}, "plan launch")
    return { planId, resumed: payload.resumed === true, status: planStatusSchema.parse(payload.status) }
  }

  async completePlanLaunch(planId: string, input: PlanLaunchCompletion): Promise<CommandPlanResult> {
    return this.planResult(
      await this.request(
        `/v1/plans/${planId}/launch/complete`,
        "POST",
        planLaunchCompletionSchema.parse(input),
        "plan launch completion"
      )
    )
  }

  async getPlan(planId: string): Promise<CommandPlanSnapshot> {
    return commandPlanSnapshotSchema.parse(await this.get(`/v1/plans/${planId}`, "plan"))
  }

  async listGoalPlans(goalId: string): Promise<CommandPlanSnapshot[]> {
    return z.array(commandPlanSnapshotSchema).parse((await this.get(`/v1/goals/${goalId}/plans`, "goal plans")).plans)
  }

  async listActiveProjectPlans(projectId: string): Promise<CommandPlanSnapshot[]> {
    const query = new URLSearchParams({ active: "true", projectId })
    return z.array(commandPlanSnapshotSchema).parse((await this.get(`/v1/plans?${query}`, "active plans")).plans)
  }

  async startOnboarding(input: OnboardingStartInput): Promise<CommandOnboardingResult> {
    return this.onboardingResult(
      await this.request("/v1/onboardings", "POST", onboardingStartSchema.parse(input), "onboarding start")
    )
  }

  async completeOnboardingDiscovery(
    onboardingId: string,
    input: OnboardingDiscoveryCompletionInput
  ): Promise<CommandOnboardingResult> {
    return this.onboardingResult(
      await this.request(
        `/v1/onboardings/${onboardingId}/discovery/complete`,
        "POST",
        onboardingDiscoveryCompletionSchema.parse(input),
        "onboarding discovery completion"
      )
    )
  }

  async beginOnboardingApply(onboardingId: string): Promise<CommandOnboardingBeginApplyResult> {
    const payload = await this.request(`/v1/onboardings/${onboardingId}/apply/begin`, "POST", {}, "onboarding apply")
    return { onboardingId, resumed: payload.resumed === true, status: onboardingStatusSchema.parse(payload.status) }
  }

  async completeOnboardingApply(
    onboardingId: string,
    input: OnboardingApplyCompletionInput
  ): Promise<CommandOnboardingResult> {
    return this.onboardingResult(
      await this.request(
        `/v1/onboardings/${onboardingId}/apply/complete`,
        "POST",
        onboardingApplyCompletionSchema.parse(input),
        "onboarding apply completion"
      )
    )
  }

  async getOnboarding(onboardingId: string): Promise<CommandOnboardingSnapshot> {
    return commandOnboardingSnapshotSchema.parse(await this.get(`/v1/onboardings/${onboardingId}`, "onboarding"))
  }

  async listProjectOnboardings(projectId: string): Promise<CommandOnboardingSnapshot[]> {
    const query = new URLSearchParams({ projectId })
    return z
      .array(commandOnboardingSnapshotSchema)
      .parse((await this.get(`/v1/onboardings?${query}`, "onboardings")).onboardings)
  }

  async proposePreference(input: PreferenceProposal): Promise<CommandPreferenceResult> {
    const payload = await this.request(
      "/v1/preferences",
      "POST",
      preferenceProposalSchema.parse(input),
      "preference proposal"
    )
    if (typeof payload.preferenceId !== "string" || typeof payload.created !== "boolean") {
      throw new Error("Command API returned an incomplete preference response")
    }
    return {
      created: payload.created,
      decisionId: typeof payload.decisionId === "string" ? payload.decisionId : null,
      preferenceId: payload.preferenceId,
      route: payload.route === "automatic" ? "automatic" : "decision",
      status: preferenceStatusSchema.parse(payload.status)
    }
  }

  async listPreferences(projectId: string | null, promotedOnly: boolean): Promise<CommandPreferenceSnapshot[]> {
    const query = new URLSearchParams({ ...(projectId === null ? {} : { projectId }), promoted: String(promotedOnly) })
    return z
      .array(commandPreferenceSnapshotSchema)
      .parse((await this.get(`/v1/preferences?${query}`, "preferences")).preferences)
  }

  private planResult(payload: Record<string, unknown>): CommandPlanResult {
    if (
      typeof payload.planId !== "string" ||
      typeof payload.created !== "boolean" ||
      typeof payload.revision !== "number"
    ) {
      throw new Error("Command API returned an incomplete plan response")
    }
    return {
      created: payload.created,
      ...(typeof payload.decisionId === "string" ? { decisionId: payload.decisionId } : {}),
      planId: payload.planId,
      revision: payload.revision,
      status: planStatusSchema.parse(payload.status)
    }
  }

  private onboardingResult(payload: Record<string, unknown>): CommandOnboardingResult {
    if (
      typeof payload.onboardingId !== "string" ||
      typeof payload.created !== "boolean" ||
      typeof payload.revision !== "number"
    ) {
      throw new Error("Command API returned an incomplete onboarding response")
    }
    return {
      created: payload.created,
      ...(typeof payload.decisionId === "string" ? { decisionId: payload.decisionId } : {}),
      onboardingId: payload.onboardingId,
      revision: payload.revision,
      status: onboardingStatusSchema.parse(payload.status)
    }
  }

  async getIntegration(integrationId: string): Promise<CommandIntegrationSnapshot> {
    const payload = await this.get(`/v1/integrations/${integrationId}`, "integration")
    if (
      typeof payload.id !== "string" ||
      typeof payload.goalId !== "string" ||
      typeof payload.projectId !== "string" ||
      typeof payload.attempt !== "number" ||
      typeof payload.baseRef !== "string" ||
      typeof payload.baseSha !== "string" ||
      typeof payload.status !== "string"
    ) {
      throw new Error("Command API returned an incomplete integration response")
    }
    return {
      attempt: payload.attempt,
      baseRef: payload.baseRef,
      baseSha: payload.baseSha.trim(),
      completion: payload.completion === null ? null : integrationCompletionSchema.parse(payload.completion),
      goalId: payload.goalId,
      id: payload.id,
      projectId: payload.projectId,
      status: payload.status
    }
  }

  /** Returns the immutable validation record, without command bookkeeping fields. */
  async findValidation(goalId: string, validationId: string): Promise<ValidationRecord> {
    const { validations } = await this.listGoalEvidence(goalId)
    const match = validations.find(
      (validation): validation is Record<string, unknown> =>
        typeof validation === "object" &&
        validation !== null &&
        (validation as Record<string, unknown>).id === validationId
    )
    if (match === undefined) {
      throw new Error(`Validation ${validationId} not found for goal ${goalId}`)
    }
    const { completedEventId: _event, createdAt: _created, id: _id, ...record } = match
    return validationRecordSchema.parse(record)
  }

  async requestHandoff(input: HandoffRequest): Promise<CommandHandoffRequestResult> {
    const payload = await this.request("/v1/handoffs", "POST", handoffRequestSchema.parse(input), "handoff request")
    if (
      typeof payload.handoffId !== "string" ||
      typeof payload.decisionId !== "string" ||
      typeof payload.created !== "boolean"
    ) {
      throw new Error("Command API returned an incomplete handoff request response")
    }
    return {
      created: payload.created,
      decisionId: payload.decisionId,
      handoffId: payload.handoffId,
      status: handoffStatusSchema.parse(payload.status)
    }
  }

  async beginHandoff(handoffId: string): Promise<CommandHandoffBeginResult> {
    const payload = await this.request(`/v1/handoffs/${handoffId}/begin`, "POST", {}, "handoff begin")
    if (typeof payload.resumed !== "boolean") {
      throw new Error("Command API returned an incomplete handoff begin response")
    }
    return { handoffId, resumed: payload.resumed, status: handoffStatusSchema.parse(payload.status) }
  }

  async completeHandoff(handoffId: string, input: HandoffCompletion): Promise<void> {
    await this.request(
      `/v1/handoffs/${handoffId}/complete`,
      "POST",
      handoffCompletionSchema.parse(input),
      "handoff completion"
    )
  }

  async getHandoff(handoffId: string): Promise<CommandHandoffSnapshot> {
    return this.handoffSnapshot(await this.get(`/v1/handoffs/${handoffId}`, "handoff"))
  }

  async listGoalHandoffs(goalId: string): Promise<CommandHandoffSnapshot[]> {
    const payload = await this.get(`/v1/goals/${goalId}/handoffs`, "goal handoffs")
    if (!Array.isArray(payload.handoffs)) {
      throw new Error("Command API returned an invalid goal handoff list")
    }
    return payload.handoffs.map((handoff: unknown) => this.handoffSnapshot(handoff))
  }

  private handoffSnapshot(value: unknown): CommandHandoffSnapshot {
    const payload = value as Record<string, unknown>
    if (
      typeof payload.id !== "string" ||
      typeof payload.body !== "string" ||
      typeof payload.decisionId !== "string" ||
      typeof payload.goalId !== "string" ||
      typeof payload.integrationId !== "string" ||
      typeof payload.projectId !== "string" ||
      typeof payload.detail !== "string"
    ) {
      throw new Error("Command API returned an incomplete handoff response")
    }
    return {
      body: payload.body,
      decisionId: payload.decisionId,
      detail: payload.detail,
      goalId: payload.goalId,
      id: payload.id,
      integrationId: payload.integrationId,
      plan: handoffPlanSchema.parse(payload.plan),
      projectId: payload.projectId,
      result: payload.result === null ? null : handoffResultSchema.parse(payload.result),
      status: handoffStatusSchema.parse(payload.status)
    }
  }

  async recordValidation(input: ValidationRecord): Promise<CommandValidationResult> {
    const payload = await this.request(
      "/v1/validations",
      "POST",
      validationRecordSchema.parse(input),
      "validation record"
    )
    if (
      typeof payload.validationId !== "string" ||
      typeof payload.created !== "boolean" ||
      (payload.status !== "passed" && payload.status !== "failed")
    ) {
      throw new Error("Command API returned an incomplete validation response")
    }
    return { created: payload.created, status: payload.status, validationId: payload.validationId }
  }

  async startIntegration(input: IntegrationStartInput): Promise<CommandIntegrationStartResult> {
    const payload = await this.request(
      "/v1/integrations",
      "POST",
      integrationStartSchema.parse(input),
      "integration start"
    )
    if (
      typeof payload.integrationId !== "string" ||
      typeof payload.attempt !== "number" ||
      typeof payload.created !== "boolean" ||
      typeof payload.status !== "string"
    ) {
      throw new Error("Command API returned an incomplete integration start response")
    }
    return {
      attempt: payload.attempt,
      created: payload.created,
      integrationId: payload.integrationId,
      status: payload.status
    }
  }

  async completeIntegration(
    integrationId: string,
    input: IntegrationCompletionInput
  ): Promise<CommandIntegrationCompletionResult> {
    const payload = await this.request(
      `/v1/integrations/${integrationId}/complete`,
      "POST",
      integrationCompletionSchema.parse(input),
      "integration completion"
    )
    if (typeof payload.completed !== "boolean" || typeof payload.status !== "string") {
      throw new Error("Command API returned an incomplete integration completion response")
    }
    return { completed: payload.completed, integrationId, status: payload.status }
  }

  async listGoalEvidence(goalId: string): Promise<{ integrations: unknown[]; validations: unknown[] }> {
    const [integrations, validations] = await Promise.all([
      this.get(`/v1/goals/${goalId}/integrations`, "goal integrations"),
      this.get(`/v1/goals/${goalId}/validations`, "goal validations")
    ])
    if (!Array.isArray(integrations.integrations) || !Array.isArray(validations.validations)) {
      throw new Error("Command API returned invalid goal evidence")
    }
    return { integrations: integrations.integrations, validations: validations.validations }
  }

  async recordWorkerBrief(workerId: string, prompt: string): Promise<CommandWorkerBriefResult> {
    const brief = workerBriefSchema.parse({ prompt })
    const payload = await this.request(`/v1/workers/${workerId}/brief`, "POST", brief, "worker brief")
    if (
      typeof payload.briefSha256 !== "string" ||
      typeof payload.eventId !== "string" ||
      typeof payload.recorded !== "boolean"
    ) {
      throw new Error("Command API returned an incomplete worker brief response")
    }
    return { briefSha256: payload.briefSha256, eventId: payload.eventId, recorded: payload.recorded, workerId }
  }

  async getWorkerBrief(workerId: string): Promise<CommandWorkerBrief> {
    const payload = await this.get(`/v1/workers/${workerId}/brief`, "worker brief")
    if (typeof payload.prompt !== "string" || typeof payload.sha256 !== "string") {
      throw new Error("Command API returned an incomplete worker brief")
    }
    return { prompt: payload.prompt, sha256: payload.sha256, workerId }
  }

  async acquireWorkerLease(workerId: string, schedulerId: string, ttlSeconds: number): Promise<CommandWorkerLeaseResult> {
    const lease = workerLeaseAcquireSchema.parse({ schedulerId, ttlSeconds })
    return this.leaseResult(await this.request(`/v1/workers/${workerId}/lease`, "POST", lease, "worker lease"), workerId)
  }

  async renewWorkerLease(workerId: string, schedulerId: string, ttlSeconds: number): Promise<CommandWorkerLeaseResult> {
    const lease = workerLeaseRenewSchema.parse({ schedulerId, ttlSeconds })
    return this.leaseResult(
      await this.request(`/v1/workers/${workerId}/lease/renew`, "POST", lease, "worker lease renewal"),
      workerId
    )
  }

  async releaseWorkerLease(workerId: string, schedulerId: string): Promise<void> {
    await this.request(
      `/v1/workers/${workerId}/lease/release`,
      "POST",
      workerLeaseReleaseSchema.parse({ schedulerId }),
      "worker lease release"
    )
  }

  async reconcileWorkerLease(workerId: string, schedulerId: string): Promise<CommandWorkerLeaseReconcileResult> {
    const payload = await this.request(
      `/v1/workers/${workerId}/lease/reconcile`,
      "POST",
      workerLeaseReconcileSchema.parse({ schedulerId }),
      "worker lease reconciliation"
    )
    if (typeof payload.reconciled !== "boolean") {
      throw new Error("Command API returned an incomplete worker lease reconciliation response")
    }
    return { reconciled: payload.reconciled, state: workerStateSchema.parse(payload.state), workerId }
  }

  async listGoalWorkers(goalId: string): Promise<CommandWorkerSnapshot[]> {
    const payload = await this.get(`/v1/goals/${goalId}/workers`, "goal workers")
    if (!Array.isArray(payload.workers)) {
      throw new Error("Command API returned an invalid goal worker list")
    }
    return payload.workers.map((worker: unknown) => this.workerSnapshot(worker))
  }

  async changeWorkerState(
    workerId: string,
    input: z.input<typeof workerStateChangeSchema>
  ): Promise<CommandWorkerStateChangeResult> {
    const change = workerStateChangeSchema.parse(input)
    const payload = await this.request(`/v1/workers/${workerId}/state`, "POST", change, "worker state change")
    if (
      typeof payload.workerId !== "string" ||
      typeof payload.eventId !== "string" ||
      typeof payload.transitioned !== "boolean" ||
      !["running", "awaiting_decision", "completed", "failed", "cancelled"].includes(String(payload.state))
    ) {
      throw new Error("Command API returned an incomplete worker state response")
    }
    return {
      eventId: payload.eventId,
      state: payload.state as CommandWorkerStateChangeResult["state"],
      transitioned: payload.transitioned,
      workerId: payload.workerId
    }
  }

  async getDecision(decisionId: string): Promise<CommandDecisionSnapshot> {
    const payload = await this.get(`/v1/decisions/${decisionId}`, "decision")
    if (typeof payload.id !== "string") {
      throw new Error("Command API returned an incomplete decision response")
    }
    return {
      id: payload.id,
      options: Array.isArray(payload.options)
        ? payload.options.flatMap((option: unknown) => {
            const value = option as Record<string, unknown>
            return typeof value.id === "string" && typeof value.label === "string"
              ? [{ id: value.id, label: value.label }]
              : []
          })
        : [],
      title: typeof payload.title === "string" ? payload.title : "",
      resolution: payload.resolution === null ? null : decisionResolutionSchema.parse(payload.resolution),
      status: decisionStatusSchema.parse(payload.status)
    }
  }

  async getWorker(workerId: string): Promise<CommandWorkerSnapshot> {
    return this.workerSnapshot(await this.get(`/v1/workers/${workerId}`, "worker"))
  }

  private leaseResult(payload: Record<string, unknown>, workerId: string): CommandWorkerLeaseResult {
    if (
      typeof payload.leaseOwner !== "string" ||
      typeof payload.leaseExpiresAt !== "string" ||
      typeof payload.changed !== "boolean"
    ) {
      throw new Error("Command API returned an incomplete worker lease response")
    }
    return { changed: payload.changed, leaseExpiresAt: payload.leaseExpiresAt, leaseOwner: payload.leaseOwner, workerId }
  }

  private workerSnapshot(value: unknown): CommandWorkerSnapshot {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Command API returned an invalid worker response")
    }
    const payload = value as Record<string, unknown>
    const nullableString = (field: unknown): string | null => (typeof field === "string" ? field : null)
    const assignment = workerAssignmentSchema.parse({
      adapter: payload.adapter,
      dependsOnWorkerIds: payload.dependsOnWorkerIds,
      goalId: payload.goalId,
      idempotencyKey: payload.idempotencyKey,
      projectId: payload.projectId,
      role: payload.role,
      worktree: payload.worktree
    })
    if (typeof payload.id !== "string") {
      throw new Error("Command API returned an incomplete worker response")
    }
    return {
      ...assignment,
      briefSha256: nullableString(payload.briefSha256),
      id: payload.id,
      leaseExpiresAt: nullableString(payload.leaseExpiresAt),
      leaseOwner: nullableString(payload.leaseOwner),
      state: workerStateSchema.parse(payload.state)
    }
  }

  private async request(path: string, method: "POST", body: object, operation: string): Promise<Record<string, unknown>> {
    const response = await fetch(new URL(path, this.endpoint), {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method
    })
    const payload = (await response.json()) as unknown
    if (!response.ok) {
      throw new Error(`Command API rejected ${operation}: ${JSON.stringify(payload)}`)
    }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new Error(`Command API returned an invalid ${operation} response`)
    }
    return payload as Record<string, unknown>
  }

  private async get(path: string, operation: string): Promise<Record<string, unknown>> {
    const response = await fetch(new URL(path, this.endpoint))
    const payload = (await response.json()) as unknown
    if (!response.ok) {
      throw new Error(`Command API rejected ${operation} lookup: ${JSON.stringify(payload)}`)
    }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new Error(`Command API returned an invalid ${operation} response`)
    }
    return payload as Record<string, unknown>
  }
}
