/** @module Factory Git operation result contracts. */

export interface DiffStats {
  changedFiles: string[]
  deletions: number
  insertions: number
}

export type MergeOutcome = { headSha: string; kind: "merged" } | { kind: "conflicted"; paths: string[] }
