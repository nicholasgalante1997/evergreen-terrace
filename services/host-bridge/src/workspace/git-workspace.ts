/** @module Governed local Git workspace capability. */

import { assertGoalPolicy, loadProjectPolicy, parseProjectPolicy } from "@evergreen-terrace/project-policy"
import type { ProjectPolicy } from "@evergreen-terrace/project-policy"
import { runProcess, tryProcess } from "../process/run-process"
import { canonicalJson } from "../support/canonical-json"
import { normalizeRemote, withoutCredentials } from "./remote-identity"
import type { GitHubRemoteState, WorkspaceStatus, WorkspaceSyncStatus } from "./workspace-status.types"

const trimOutput = (value: string): string => value.trim()

export class GoalGateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GoalGateError"
  }
}

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
      remoteUrl: withoutCredentials(trimOutput(remote.stdout))
    }
  }

  /**
   * The first-goal gate. A goal is accepted only when the project is onboarded
   * at its base: `.et/config.toml` is committed there, the working copy has not
   * changed it, and the canonical remote still names the project. Any
   * divergence is refused with the reason, never guessed around.
   */
  async resolveGoalBase(input: {
    baseRef: string
    priorityClass: string
  }): Promise<{ baseSha: string; policy: ProjectPolicy }> {
    const working = await this.policy()
    assertGoalPolicy(working, input)
    const base = await runProcess(["git", "rev-parse", "--verify", `${input.baseRef}^{commit}`], this.projectRoot)
    const baseSha = trimOutput(base.stdout)
    const committed = await this.committedPolicy(baseSha)
    if (committed === null) {
      throw new GoalGateError(
        `The project is not onboarded at ${input.baseRef} (${baseSha}): .et/config.toml is not committed there. Run evergreen.onboarding.discover, approve and apply it, and merge the onboarding branch.`
      )
    }
    if (canonicalJson(committed) !== canonicalJson(working)) {
      throw new GoalGateError(
        `The working copy's .et/config.toml differs from the one committed at ${input.baseRef}. Policy changes go through a factory branch and review; commit or revert the change first.`
      )
    }
    const remote = await runProcess(["git", "remote", "get-url", committed.canonical_remote], this.projectRoot)
    const identity = await normalizeRemote(trimOutput(remote.stdout))
    if (identity !== committed.project_id) {
      throw new GoalGateError(
        `Remote ${committed.canonical_remote} identifies ${identity ?? "an unrecognized repository"}, but the approved policy is for ${committed.project_id}.`
      )
    }
    return { baseSha, policy: committed }
  }

  /** Repository paths tracked at one commit. */
  async trackedFiles(commitSha: string): Promise<string[]> {
    const listed = await runProcess(["git", "ls-tree", "-r", "--name-only", "-z", commitSha], this.projectRoot)
    return listed.stdout.split("\0").filter((path) => path.length > 0)
  }

  /** The policy as committed at one commit; null when that commit has none. */
  async committedPolicy(commitSha: string): Promise<ProjectPolicy | null> {
    const shown = await tryProcess(["git", "show", `${commitSha}:.et/config.toml`], this.projectRoot)
    return shown.exitCode === 0 ? parseProjectPolicy(shown.stdout) : null
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
