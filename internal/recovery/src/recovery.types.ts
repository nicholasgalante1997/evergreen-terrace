/** @module Local recovery-snapshot contracts. */

export interface CommandResult {
  exitCode: number
  stderr: string
}

/** Runs one argv; stdout goes to a file when given, otherwise it is returned. */
export interface CommandRunner {
  run(
    argv: readonly string[],
    options?: { cwd?: string; stdoutPath?: string }
  ): Promise<CommandResult & { stdout: string }>
}

export interface SnapshotRequest {
  backupRoot: string
  /** Factory root whose durable records (not worktrees) are archived. */
  factoryRoot: string | null
  /** Also archive full worker artifacts, which can be large. */
  includeArtifacts: boolean
  /** Repositories whose `.et` history is exported. */
  projectRoots: readonly string[]
  reason: string
}

export interface ManifestFile {
  bytes: number
  path: string
  sha256: string
}

export interface SnapshotManifest {
  createdAt: string
  files: ManifestFile[]
  kafka: { exported: number; offsets: Record<string, number>; topic: string } | null
  reason: string
  skipped: string[]
  version: 1
}
