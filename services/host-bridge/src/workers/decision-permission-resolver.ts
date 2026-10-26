/** @module Durable engineer-decision resolver for ACP permissions. */

import type { CommandApiClient } from "../command-api/command-api-client"
import { acpPermissionRequest, describeAcpPermission } from "./acp-permission"
import { permissionDecisionCard } from "./permission-decision-card"
import type { AcpPermissionResolution, AcpPermissionResolver } from "./acp-runner.types"
import type { DecisionPermissionContext } from "./decision-permission-resolver.types"

const pollingIntervalMs = 500

export class DecisionPermissionResolver implements AcpPermissionResolver {
  #requestNumber = 0

  constructor(
    private readonly commandApi: CommandApiClient,
    private readonly context: DecisionPermissionContext
  ) {}

  async resolve(params: unknown): Promise<AcpPermissionResolution> {
    const request = acpPermissionRequest(params)
    const requestNumber = ++this.#requestNumber
    const allowOnce = request.options.filter((option) => option.kind === "allow_once")
    const optionMap = new Map(allowOnce.map((option, index) => [`allow-once-${index + 1}`, option.optionId]))
    await this.commandApi.changeWorkerState(this.context.workerId, {
      detail: `ACP permission request ${requestNumber} is awaiting an engineer decision.`,
      schedulerId: this.context.schedulerId,
      state: "awaiting_decision"
    })
    const decision = await this.commandApi.requestDecision(
      permissionDecisionCard({
        allowOnceOptionIds: [...optionMap.keys()],
        description: describeAcpPermission(params, this.context.worktreePath),
        goalId: this.context.goalId,
        projectId: this.context.projectId,
        requestNumber,
        role: this.context.role,
        workerId: this.context.workerId
      })
    )
    const resolved = await this.waitForResolution(decision.decisionId)
    await this.commandApi.changeWorkerState(this.context.workerId, {
      detail: `ACP permission request ${requestNumber} received an engineer decision.`,
      schedulerId: this.context.schedulerId,
      state: "running"
    })
    const selectedOptionId = resolved.resolution?.selectedOptionId
    const optionId =
      resolved.status === "approved" && selectedOptionId !== null && selectedOptionId !== undefined
        ? optionMap.get(selectedOptionId)
        : undefined
    return {
      decisionId: decision.decisionId,
      granted: optionId !== undefined,
      response: optionId === undefined ? this.decline(request.options) : { outcome: { optionId, outcome: "selected" } },
      via: "decision"
    }
  }

  private async waitForResolution(decisionId: string) {
    for (;;) {
      const decision = await this.commandApi.getDecision(decisionId)
      if (decision.status !== "requested") {
        return decision
      }
      await Bun.sleep(pollingIntervalMs)
    }
  }

  private decline(options: ReadonlyArray<{ kind: string; optionId: string }>): unknown {
    const rejected = options.find((option) => option.kind === "reject_once")
    return rejected === undefined
      ? { outcome: { outcome: "cancelled" } }
      : { outcome: { optionId: rejected.optionId, outcome: "selected" } }
  }
}
