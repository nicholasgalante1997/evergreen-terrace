/** @module Deterministic onboarding facts read from local Git state; nothing here fetches or writes. */

import type { OnboardingFacts } from "@evergreen-terrace/contracts"
import { runProcess, tryProcess } from "../process/run-process"
import { normalizeRemote, withoutCredentials } from "../workspace/remote-identity"

/** Files whose presence tells discovery where the build, checks, and contributor rules live. */
const manifestPattern =
  /(^|\/)(package\.json|bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.toml|go\.mod|pyproject\.toml|requirements[^/]*\.txt|Gemfile|pom\.xml|build\.gradle(\.kts)?|Makefile|justfile|Dockerfile|compose\.ya?ml|docker-compose\.ya?ml|tsconfig\.json|CONTRIBUTING\.md|AGENTS\.md|CLAUDE\.md|README\.md|\.et\/config\.toml)$|^\.github\/workflows\/[^/]+\.ya?ml$|^\.gitlab-ci\.yml$/

export class RepositoryFacts {
  constructor(private readonly projectRoot: string) {}

  /** Without a base ref, the remote's default branch (or main/master, or the active branch) is the base. */
  async collect(input: {
    baseRef?: string
    remote: string
  }): Promise<{ facts: OnboardingFacts; trackedFiles: string[] }> {
    const git = (argumentsValue: string[]) =>
      runProcess(["git", ...argumentsValue], this.projectRoot).then((result) => result.stdout.trim())
    const remoteUrl = await git(["remote", "get-url", input.remote])
    const projectId = await normalizeRemote(remoteUrl)
    if (projectId === null) {
      throw new Error(`Remote ${input.remote} (${withoutCredentials(remoteUrl)}) is not a host/owner/repository remote`)
    }
    const [activeBranch, headSha, branches] = await Promise.all([
      git(["branch", "--show-current"]),
      git(["rev-parse", "HEAD"]),
      git(["for-each-ref", "--format=%(refname:short)", "refs/heads"])
    ])
    const remoteHead = await tryProcess(
      ["git", "symbolic-ref", "--short", `refs/remotes/${input.remote}/HEAD`],
      this.projectRoot
    )
    const localBranches = branches.split("\n").filter((branch) => branch.length > 0)
    const defaultBranch =
      remoteHead.exitCode === 0
        ? remoteHead.stdout.trim().replace(`${input.remote}/`, "")
        : (["main", "master"].find((name) => localBranches.includes(name)) ?? null)
    const baseRef = input.baseRef ?? defaultBranch ?? activeBranch
    if (baseRef.length === 0) {
      throw new Error("No base ref given, and the repository has no default or active branch")
    }
    const baseSha = await git(["rev-parse", "--verify", `${baseRef}^{commit}`])
    const trackedFiles = (
      await runProcess(["git", "ls-tree", "-r", "--name-only", "-z", baseSha], this.projectRoot)
    ).stdout
      .split("\0")
      .filter((path) => path.length > 0)
    return {
      facts: {
        activeBranch,
        baseRef,
        baseSha,
        collectedAt: new Date().toISOString(),
        defaultBranch,
        existingPolicy: trackedFiles.includes(".et/config.toml"),
        headSha,
        localBranches: localBranches.slice(0, 200),
        manifests: trackedFiles.filter((path) => manifestPattern.test(path) && path.split("/").length <= 3).slice(0, 100),
        projectId,
        remote: { name: input.remote, url: withoutCredentials(remoteUrl) },
        topLevel: [
          ...new Set(trackedFiles.map((path) => (path.includes("/") ? `${path.slice(0, path.indexOf("/"))}/` : path)))
        ].slice(0, 200),
        trackedFileCount: trackedFiles.length
      },
      trackedFiles
    }
  }

  /** Line count of a file at a commit, or null when it does not exist there. */
  async lineCount(commitSha: string, path: string): Promise<number | null> {
    const shown = await tryProcess(["git", "show", `${commitSha}:${path}`], this.projectRoot)
    return shown.exitCode === 0 ? shown.stdout.split("\n").length : null
  }
}
