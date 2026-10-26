/** @module Factory-identity Git operations inside one factory-owned worktree. */

import { createHash } from "node:crypto"
import { runProcess, tryProcess } from "../process/run-process"
import type { DiffStats, MergeOutcome } from "./factory-git.types"

/**
 * Factory commits use a fixed identity and never sign or prompt, so an
 * unattended capture or merge cannot block on the engineer's signing setup.
 */
const factoryIdentity = [
  "-c",
  "user.name=Evergreen Terrace Factory",
  "-c",
  "user.email=factory@evergreen-terrace.invalid",
  "-c",
  "commit.gpgsign=false"
]

export class FactoryGit {
  constructor(readonly worktreePath: string) {}

  async head(): Promise<string> {
    return (await this.git(["rev-parse", "HEAD"])).trim()
  }

  async currentBranch(): Promise<string> {
    return (await this.git(["branch", "--show-current"])).trim()
  }

  async isClean(): Promise<boolean> {
    return (await this.git(["status", "--porcelain", "--untracked-files=all"])).trim().length === 0
  }

  /** Commits uncommitted worker output on the worker's own factory branch; null when already clean. */
  async captureWorkerOutput(message: string): Promise<string | null> {
    if (await this.isClean()) {
      return null
    }
    await this.git(["add", "--all"])
    await this.git([...factoryIdentity, "commit", "--no-verify", "--quiet", "-m", message])
    return this.head()
  }

  async diffStats(fromSha: string, toSha: string): Promise<DiffStats> {
    const output = await this.git(["diff", "--numstat", "--no-renames", "-z", fromSha, toSha])
    const changedFiles: string[] = []
    let insertions = 0
    let deletions = 0
    for (const entry of output.split("\0").filter((value) => value.length > 0)) {
      const [added, removed, ...pathParts] = entry.split("\t")
      changedFiles.push(pathParts.join("\t"))
      insertions += added === "-" ? 0 : Number(added)
      deletions += removed === "-" ? 0 : Number(removed)
    }
    return { changedFiles, deletions, insertions }
  }

  /**
   * Merges one source commit. By default a conflict is aborted and reported, never
   * left in the worktree. With `keepConflicts`, the conflicted merge is left open
   * for the integrator agent; the caller must then `commitResolvedMerge` or `abortMerge`.
   */
  async merge(commitSha: string, message: string, options: { keepConflicts?: boolean } = {}): Promise<MergeOutcome> {
    const merged = await tryProcess(
      ["git", ...factoryIdentity, "merge", "--no-ff", "--no-edit", "--no-verify", "-m", message, commitSha],
      this.worktreePath
    )
    if (merged.exitCode === 0) {
      return { headSha: await this.head(), kind: "merged" }
    }
    const conflicted = await this.paths(["diff", "--name-only", "--diff-filter=U", "-z"])
    if (conflicted.length === 0 || options.keepConflicts !== true) {
      await this.abortMerge()
    }
    if (conflicted.length === 0) {
      throw new Error(`Merge of ${commitSha} failed without conflicts: ${merged.stderr.trim()}`)
    }
    return { kind: "conflicted", paths: conflicted }
  }

  async mergeInProgress(): Promise<boolean> {
    return (await tryProcess(["git", "rev-parse", "-q", "--verify", "MERGE_HEAD"], this.worktreePath)).exitCode === 0
  }

  async abortMerge(): Promise<void> {
    await tryProcess(["git", "merge", "--abort"], this.worktreePath)
  }

  /** Files still carrying conflict markers; checked by the host, never trusted from the agent. */
  async filesWithConflictMarkers(paths: readonly string[]): Promise<string[]> {
    const marked: string[] = []
    for (const path of paths) {
      const file = Bun.file(`${this.worktreePath}/${path}`)
      if ((await file.exists()) && /^(<{7}|>{7})( |$)/m.test(await file.text())) {
        marked.push(path)
      }
    }
    return marked
  }

  /** Tracked files changed in the worktree relative to the index (unstaged edits). */
  async unstagedPaths(): Promise<string[]> {
    return this.paths(["diff", "--name-only", "-z"])
  }

  async untrackedPaths(): Promise<string[]> {
    return this.paths(["ls-files", "--others", "--exclude-standard", "-z"])
  }

  /** Stages the resolved paths and records the open merge as a two-parent factory commit. */
  async commitResolvedMerge(paths: readonly string[], message: string): Promise<string> {
    await this.git(["add", "--", ...paths])
    await this.git([...factoryIdentity, "commit", "--no-verify", "--quiet", "-m", message])
    return this.head()
  }

  async parents(commitSha: string): Promise<string[]> {
    return (await this.git(["rev-list", "--parents", "-n", "1", commitSha])).trim().split(/\s+/).slice(1)
  }

  private async paths(argumentsValue: readonly string[]): Promise<string[]> {
    return (await this.git(argumentsValue)).split("\0").filter((path) => path.length > 0)
  }

  /** Writes the full binary-safe patch between two commits and returns its digest. */
  async writePatch(fromSha: string, toSha: string, path: string): Promise<string> {
    const patch = await this.git(["diff", "--binary", "--no-renames", fromSha, toSha])
    await Bun.write(path, patch)
    return createHash("sha256").update(patch).digest("hex")
  }

  /** Observes the remote without changing anything; null when the branch does not exist there. */
  async remoteBranchSha(remote: string, branch: string): Promise<string | null> {
    const output = await this.git(["ls-remote", "--heads", remote, `refs/heads/${branch}`])
    const sha = output.trim().split(/\s+/)[0]
    return sha === undefined || sha.length === 0 ? null : sha
  }

  /**
   * Pushes one exact commit to one branch. There is deliberately no force
   * option: a non-fast-forward remote branch makes the push fail.
   */
  async pushCommit(remote: string, commitSha: string, branch: string): Promise<void> {
    await this.git(["push", "--porcelain", "--no-verify", remote, `${commitSha}:refs/heads/${branch}`])
  }

  private async git(argumentsValue: readonly string[]): Promise<string> {
    return (await runProcess(["git", ...argumentsValue], this.worktreePath)).stdout
  }
}
