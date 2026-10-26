/** @module Secret-safe ACP permission request extraction and description. */

import { isAbsolute, relative, resolve } from "node:path"
import type {
  AcpPermissionDescription,
  AcpPermissionLocation,
  AcpPermissionOption,
  AcpPermissionRequest
} from "./acp-permission.types"

const recordValue = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

const permissionOption = (value: unknown): AcpPermissionOption | undefined => {
  const option = recordValue(value)
  if (option === undefined || typeof option.optionId !== "string" || typeof option.kind !== "string") {
    return undefined
  }
  return { kind: option.kind, optionId: option.optionId }
}

const toolKinds = new Set(["read", "edit", "delete", "move", "search", "execute", "think", "fetch", "switch_mode", "other"])

/**
 * Kinds whose ACP title names only files ("Write notes/api.md"). Execute and
 * fetch titles carry command lines and URLs, which may hold credentials, so
 * their titles are never copied into cards, events, or artifacts.
 */
const fileOnlyKinds = new Set(["read", "edit", "delete", "move", "search"])

const maximumLocations = 20

export const acpPermissionRequest = (value: unknown): AcpPermissionRequest => {
  const request = recordValue(value)
  const options = Array.isArray(request?.options) ? request.options.map(permissionOption).filter(Boolean) : []
  const toolCall = recordValue(request?.toolCall)
  const kind = typeof toolCall?.kind === "string" && toolKinds.has(toolCall.kind) ? toolCall.kind : null
  const locations = Array.isArray(toolCall?.locations)
    ? toolCall.locations.flatMap((location) => {
        const path = recordValue(location)?.path
        return typeof path === "string" && path.length > 0 ? [path] : []
      })
    : []
  return {
    options: options as AcpPermissionOption[],
    toolCall: {
      kind,
      locations,
      title: typeof toolCall?.title === "string" ? toolCall.title : null
    }
  }
}

const describeLocation = (path: string, worktreePath: string): AcpPermissionLocation => {
  const absolute = isAbsolute(path) ? resolve(path) : resolve(worktreePath, path)
  const inside = relative(resolve(worktreePath), absolute)
  return inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))
    ? { insideWorktree: true, path: inside === "" ? "." : inside }
    : { insideWorktree: false, path: absolute }
}

/** What the engineer needs to review a request, without command or URL text. */
export const describeAcpPermission = (value: unknown, worktreePath: string): AcpPermissionDescription => {
  const { toolCall } = acpPermissionRequest(value)
  const locations = toolCall.locations.slice(0, maximumLocations).map((path) => describeLocation(path, worktreePath))
  return {
    kind: toolCall.kind ?? "unknown",
    locations,
    locationsTruncated: toolCall.locations.length > maximumLocations,
    outsideWorktree: locations.some((location) => !location.insideWorktree),
    title: toolCall.kind !== null && fileOnlyKinds.has(toolCall.kind) && toolCall.title !== null ? toolCall.title.slice(0, 200) : null
  }
}

/** One-line reviewable summary, e.g. `edit notes/api.md` or `execute (command withheld) in worktree`. */
export const permissionHeadline = (description: AcpPermissionDescription): string => {
  const [first] = description.locations
  const target =
    first === undefined
      ? description.kind === "execute" || description.kind === "fetch"
        ? `(${description.kind === "execute" ? "command" : "URL"} withheld)`
        : "(no location given)"
      : `${first.path}${description.locations.length > 1 ? ` +${description.locations.length - 1} more` : ""}`
  return `${description.kind} ${target}${description.outsideWorktree ? " OUTSIDE the worktree" : ""}`
}

export const acpPermissionRequestSummary = (value: unknown, worktreePath: string): Record<string, unknown> => {
  const request = acpPermissionRequest(value)
  return {
    ...describeAcpPermission(value, worktreePath),
    optionCount: request.options.length,
    optionKinds: request.options.map((option) => option.kind)
  }
}

export const acpPermissionResponseSummary = (value: unknown): Record<string, unknown> => {
  const response = recordValue(value)
  const outcome = recordValue(response?.outcome)
  return { outcome: typeof outcome?.outcome === "string" ? outcome.outcome : "unknown" }
}
