/** @module Factory-owned worktree request and provenance contracts. */

export interface WorktreePreparation {
  attempt: number
  baseRef: string
  /** Pins the worktree to a recorded commit instead of resolving `baseRef` now. */
  baseSha?: string
  branchClass: string
  goalId: string
  role: string
}

export interface FactoryWorktreeRecord {
  artifactDirectory: string
  attempt: number
  baseRef: string
  baseSha: string
  branch: string
  createdAt: string
  goalId: string
  manifestPath: string
  projectId: string
  role: string
  worktreePath: string
}

export interface WorktreePaths {
  artifactDirectory: string
  manifestPath: string
  worktreePath: string
}

export interface WorktreeRegistrationFailure {
  failedAt: string
  manifestPath: string
  message: string
  stage: "worker_registration"
  worktreePath: string
}
