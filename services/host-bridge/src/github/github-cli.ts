/** @module `gh`-backed GitHub capability using the engineer's installed authentication. */

import { z } from "zod"
import { runProcess } from "../process/run-process"
import type { GitHubPort, PullRequestCreation, PullRequestReference } from "./github.types"

const pullRequestSchema = z.object({ number: z.number().int().positive(), url: z.string().url() })

export class GitHubCli implements GitHubPort {
  constructor(private readonly cwd: string) {}

  async findOpenPullRequest(repository: string, head: string): Promise<PullRequestReference | null> {
    const output = await this.gh([
      "pr",
      "list",
      "--repo",
      repository,
      "--head",
      head,
      "--state",
      "open",
      "--json",
      "number,url",
      "--limit",
      "1"
    ])
    const [first] = z.array(pullRequestSchema).parse(JSON.parse(output))
    return first ?? null
  }

  async createPullRequest(repository: string, input: PullRequestCreation): Promise<PullRequestReference> {
    const output = await this.gh([
      "pr",
      "create",
      "--repo",
      repository,
      "--base",
      input.base,
      "--head",
      input.head,
      "--title",
      input.title,
      "--body-file",
      input.bodyPath
    ])
    const url = output.trim().split("\n").at(-1) ?? ""
    return pullRequestSchema.parse(JSON.parse(await this.gh(["pr", "view", url, "--repo", repository, "--json", "number,url"])))
  }

  async findCommentContaining(repository: string, number: number, marker: string): Promise<string | null> {
    const output = await this.gh(["pr", "view", String(number), "--repo", repository, "--json", "comments"])
    const { comments } = z
      .object({ comments: z.array(z.object({ body: z.string(), url: z.string().url() }).passthrough()) })
      .parse(JSON.parse(output))
    return comments.find((comment) => comment.body.includes(marker))?.url ?? null
  }

  async commentOnPullRequest(repository: string, number: number, bodyPath: string): Promise<string> {
    const output = await this.gh(["pr", "comment", String(number), "--repo", repository, "--body-file", bodyPath])
    return output.trim().split("\n").at(-1) ?? ""
  }

  private async gh(argumentsValue: readonly string[]): Promise<string> {
    return (await runProcess(["gh", ...argumentsValue], this.cwd)).stdout
  }
}
