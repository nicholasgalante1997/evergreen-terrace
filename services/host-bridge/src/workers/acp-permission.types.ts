/** @module ACP permission-request extraction contracts. */

export interface AcpPermissionOption {
  kind: string
  optionId: string
}

/** Raw fields of an ACP v1 `session/request_permission` tool call; never persisted as-is. */
export interface AcpPermissionRequest {
  options: AcpPermissionOption[]
  toolCall: {
    kind: string | null
    locations: string[]
    title: string | null
  }
}

export interface AcpPermissionLocation {
  insideWorktree: boolean
  /** Worktree-relative when inside; absolute when outside, because that is the risk signal. */
  path: string
}

/** The reviewable, secret-safe description used in decision cards and artifact logs. */
export interface AcpPermissionDescription {
  kind: string
  locations: AcpPermissionLocation[]
  locationsTruncated: boolean
  outsideWorktree: boolean
  /** Present only for file-only kinds; execute/fetch titles may contain credentials. */
  title: string | null
}
