/** @module Read-only inspected workspace state. */

export interface WorkspaceStatus {
  canonicalRemote: string
  currentBranch: string
  headSha: string
  projectId: string
  remoteUrl: string
}

export interface GitHubRemoteState {
  defaultBranchRef: { name: string } | null
  nameWithOwner: string
}

export interface WorkspaceSyncStatus {
  github: GitHubRemoteState
  workspace: WorkspaceStatus
}
