/** @module Governed local Git workspace capability. */

import { assertGoalPolicy, loadProjectPolicy } from "@evergreen-terrace/project-policy"
import type { ProjectPolicy } from "@evergreen-terrace/project-policy"
import { runProcess } from "../process/run-process"
import type { GitHubRemoteState, WorkspaceStatus, WorkspaceSyncStatus } from "./workspace-status.types"

const trimOutput = (value: string): string => value.trim()

export class GitWorkspace {
  constructor(readonly projectRoot: string) {}

  async status(): Promise<WorkspaceStatus> {
    const policy = await this.policy()
    const [branch, head, remote] = await Promise.all([
      runProcess(["git", "branch", "--show-current"], this.projectRoot),
      runProcess(["git", "rev-parse", "HEAD"], this.projectRoot),
      runProcess(["git", "remote", "get-url", policy.canonical_remote], this.projectRoot)
    ])
    return {
      canonicalRemote: policy.canonical_remote,
      currentBranch: trimOutput(branch.stdout),
      headSha: trimOutput(head.stdout),
      projectId: policy.project_id,
      remoteUrl: trimOutput(remote.stdout)
    }
  }

  async resolveGoalBase(input: {
    baseRef: string
    priorityClass: string
  }): Promise<{ baseSha: string; policy: ProjectPolicy }> {
    const policy = await this.policy()
    assertGoalPolicy(policy, input)
    await runProcess(["git", "remote", "get-url", policy.canonical_remote], this.projectRoot)
    const base = await runProcess(["git", "rev-parse", "--verify", `${input.baseRef}^{commit}`], this.projectRoot)
    return { baseSha: trimOutput(base.stdout), policy }
  }

  async sync(): Promise<WorkspaceSyncStatus> {
    const policy = await this.policy()
    await runProcess(["git", "fetch", policy.canonical_remote, "--prune"], this.projectRoot)
    const repository = policy.project_id.replace(/^github\.com\//, "")
    if (repository === policy.project_id) {
      throw new Error(`workspace.sync requires a GitHub project identity: ${policy.project_id}`)
    }
    const metadata = await runProcess(
      ["gh", "repo", "view", repository, "--json", "nameWithOwner,defaultBranchRef"],
      this.projectRoot
    )
    return { github: JSON.parse(metadata.stdout) as GitHubRemoteState, workspace: await this.status() }
  }

  private async policy(): Promise<ProjectPolicy> {
    return loadProjectPolicy(this.projectRoot)
  }
}
