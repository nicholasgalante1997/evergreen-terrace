/** @module Pure decision-card text for an ACP permission request. */

import type { DecisionRequest } from "@evergreen-terrace/contracts"
import { permissionHeadline } from "./acp-permission"
import type { AcpPermissionDescription } from "./acp-permission.types"

export interface PermissionCardInput {
  allowOnceOptionIds: readonly string[]
  description: AcpPermissionDescription
  goalId: string
  projectId: string
  requestNumber: number
  role: string
  workerId: string
}

/** States exactly what is requested and where, so the card can be decided without digging through logs. */
export const permissionDecisionCard = (input: PermissionCardInput): DecisionRequest => {
  const { description } = input
  const locationLines =
    description.locations.length === 0
      ? ["- No file locations were reported by the agent."]
      : description.locations.map(
          (location) => `- ${location.path}${location.insideWorktree ? "" : "  <-- OUTSIDE the worker worktree"}`
        )
  const context = [
    `Worker ${input.role} (${input.workerId}) requests permission #${input.requestNumber}.`,
    "",
    `Action kind: ${description.kind}`,
    ...(description.title === null ? [] : [`Agent title: ${description.title}`]),
    description.kind === "execute" || description.kind === "fetch"
      ? `The ${description.kind === "execute" ? "command line" : "URL"} is withheld because it may contain credentials; read it in the worker's acp.events.ndjson before approving.`
      : null,
    "",
    "Locations:",
    ...locationLines,
    ...(description.locationsTruncated ? ["- (more locations omitted)"] : []),
    "",
    description.outsideWorktree
      ? "WARNING: at least one location is outside the worker's worktree."
      : "All reported locations are inside the worker's worktree.",
    "Approval allows this single operation once; persistent permissions are never granted."
  ].filter((line): line is string => line !== null)
  return {
    category: "security",
    context: context.join("\n").slice(0, 20_000),
    goalId: input.goalId,
    idempotencyKey: `acp-permission-${input.workerId}-${input.requestNumber}`,
    options:
      input.allowOnceOptionIds.length === 0
        ? [{ detail: "Cancel this ACP permission request.", id: "cancel", label: "Cancel request" }]
        : input.allowOnceOptionIds.map((id) => ({
            detail: "Allow this operation once; persistent ACP permissions are not available.",
            id,
            label: "Allow once"
          })),
    projectId: input.projectId,
    recommendedOptionId: null,
    title: `${input.role}: ${permissionHeadline(description)}`.slice(0, 240)
  }
}
