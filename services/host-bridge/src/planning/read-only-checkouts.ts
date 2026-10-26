/** @module Detached checkouts of one exact commit for read-only planning and discovery sessions. */

import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { runProcess } from "../process/run-process"
import { projectSegment } from "../worktrees/worktree-paths"
import type { ReadOnlyCheckout } from "./read-only-agent.types"

const segment = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/**
 * Each session gets its own detached worktree under the factory root, pinned
 * to a commit. It has no branch, so nothing a session does can be pushed or
 * merged, and the sandbox mounts it read-only. Checkouts are kept as evidence.
 */
export class ReadOnlyCheckouts {
  constructor(
    private readonly factoryRoot: string,
    private readonly projectRoot: string
  ) {}

  async create(input: {
    baseSha: string
    key: string
    ownerId: string
    projectId: string
    purpose: "onboarding" | "plans"
  }): Promise<ReadOnlyCheckout> {
    if (!segment.test(input.ownerId) || !segment.test(input.key)) {
      throw new Error(`Invalid checkout name: ${input.ownerId}/${input.key}`)
    }
    const project = projectSegment(input.projectId)
    const checkoutPath = join(this.factoryRoot, "checkouts", project, input.purpose, input.ownerId, input.key)
    const artifactDirectory = join(this.factoryRoot, "artifacts", project, input.purpose, input.ownerId, input.key)
    await mkdir(dirname(checkoutPath), { recursive: true })
    await mkdir(artifactDirectory, { recursive: true })
    await runProcess(["git", "worktree", "add", "--detach", checkoutPath, input.baseSha], this.projectRoot)
    return { artifactDirectory, checkoutPath }
  }
}
