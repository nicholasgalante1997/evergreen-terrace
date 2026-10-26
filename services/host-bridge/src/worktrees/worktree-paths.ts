/** @module Deterministic factory worktree and manifest paths. */

import { createHash } from "node:crypto"
import { join } from "node:path"
import type { WorktreePaths } from "./worktree.types"

export const projectSegment = (projectId: string): string => {
  const readable = projectId.replaceAll(/[^a-zA-Z0-9._-]/g, "_")
  const fingerprint = createHash("sha256").update(projectId).digest("hex").slice(0, 16)
  return `${readable}--${fingerprint}`
}

export const deriveWorktreePaths = (
  factoryRoot: string,
  projectId: string,
  goalId: string,
  role: string,
  attempt: number
): WorktreePaths => {
  const projectRoot = projectSegment(projectId)
  const attemptSegment = `attempt-${attempt}`
  return {
    artifactDirectory: join(factoryRoot, "artifacts", projectRoot, "goals", goalId, role, attemptSegment),
    manifestPath: join(
      factoryRoot,
      "records",
      projectRoot,
      "goals",
      goalId,
      "worktrees",
      role,
      attemptSegment,
      "manifest.json"
    ),
    worktreePath: join(factoryRoot, "worktrees", projectRoot, goalId, role, attemptSegment)
  }
}
