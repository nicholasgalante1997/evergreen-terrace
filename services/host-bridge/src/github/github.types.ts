/** @module Governed GitHub capability contracts. */

export interface PullRequestReference {
  number: number
  url: string
}

export interface PullRequestCreation {
  base: string
  bodyPath: string
  head: string
  title: string
}

/** The only GitHub operations the factory may perform. There is no merge. */
export interface GitHubPort {
  commentOnPullRequest(repository: string, number: number, bodyPath: string): Promise<string>
  createPullRequest(repository: string, input: PullRequestCreation): Promise<PullRequestReference>
  findCommentContaining(repository: string, number: number, marker: string): Promise<string | null>
  findOpenPullRequest(repository: string, head: string): Promise<PullRequestReference | null>
}
