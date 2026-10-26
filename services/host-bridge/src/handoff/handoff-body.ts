/** @module Pure rendering of integration-train evidence into a pull-request body. */

import type { IntegrationCompletion, ValidationRecord } from "@evergreen-terrace/contracts"

export interface HandoffBodyInput {
  attempt: number
  baseRef: string
  baseSha: string
  completion: IntegrationCompletion
  goal: { id: string; title: string }
  integrationId: string
  validation: ValidationRecord
}

const code = (value: string): string => `\`${value.replaceAll("`", "'")}\``
const short = (sha: string): string => sha.slice(0, 12)
const seconds = (durationMs: number): string => `${(durationMs / 1_000).toFixed(1)}s`
const cell = (value: string): string => value.replaceAll("|", "\\|").replaceAll("\n", " ")
const quote = (text: string): string =>
  text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")

/**
 * Renders reviewable evidence for the goal PR. Local filesystem paths (worktrees,
 * artifacts, logs) are deliberately omitted: they reveal the engineer's machine
 * layout and mean nothing to a reviewer. Digests identify the local evidence.
 */
export const renderHandoffBody = (input: HandoffBodyInput): string => {
  const { completion, validation } = input
  const diff = completion.aggregateDiff
  const sourceRows = completion.mergeOrder.map((workerId, index) => {
    const source = completion.sources.find((candidate) => candidate.workerId === workerId)
    if (source === undefined) {
      throw new Error(`Merge order names unknown source ${workerId}`)
    }
    const captured = source.captureCommitSha === null ? "" : ` (captured ${code(short(source.captureCommitSha))})`
    return `| ${index + 1} | ${cell(source.role)} | ${code(short(source.commitSha))}${captured} | ${source.changedFiles.length} | +${source.insertions} / -${source.deletions} |`
  })
  const validationRows = validation.results.map(
    (result) =>
      `| ${result.phase} | ${code(cell(result.command))} | ${result.timedOut ? "timed out" : String(result.exitCode)} | ${seconds(result.durationMs)} |`
  )
  return [
    `## ${input.goal.title}`,
    "",
    "Opened by the Evergreen Terrace integration train. The engineer reviews and merges; the factory never merges.",
    "",
    "| | |",
    "| --- | --- |",
    `| Goal | ${code(input.goal.id)} |`,
    `| Integration | ${code(input.integrationId)} (attempt ${input.attempt}) |`,
    `| Base | ${code(input.baseRef)} at ${code(short(input.baseSha))} |`,
    `| Head | ${code(completion.headSha ?? "unknown")} |`,
    diff === null
      ? "| Aggregate diff | unavailable |"
      : `| Aggregate diff | ${diff.filesChanged} files, +${diff.insertions} / -${diff.deletions}, sha256 ${code(diff.sha256)} |`,
    "",
    "### Sources, in merge order",
    "",
    "| # | Role | Commit | Files | Lines |",
    "| --- | --- | --- | --- | --- |",
    ...sourceRows,
    "",
    "### Overlapping files",
    "",
    ...(completion.overlaps.length === 0
      ? ["None: no file was changed by more than one source."]
      : completion.overlaps.map(
          (overlap) =>
            `- ${code(overlap.path)}: ${overlap.workerIds
              .map((workerId) => completion.sources.find((source) => source.workerId === workerId)?.role ?? workerId)
              .join(", ")}`
        )),
    ...(completion.selection === null
      ? []
      : [
          "",
          "### Excluded worker output",
          "",
          ...completion.selection.excludedWorkerIds.map((workerId) => `- ${code(workerId)}`),
          "",
          "Rationale:",
          "",
          quote(completion.selection.rationale)
        ]),
    ...(completion.resolutions.length === 0
      ? []
      : [
          "",
          "### Conflicts resolved by the integrator agent",
          "",
          "Each resolution was verified by the factory before commit: merge still open, no conflict markers, and only the conflicted files changed. Review these hunks closely.",
          ...completion.resolutions.flatMap((resolution) => [
            "",
            `**${completion.sources.find((source) => source.workerId === resolution.conflictedWorkerId)?.role ?? resolution.conflictedWorkerId}** conflicted on ${resolution.paths.map(code).join(", ")}; resolved in ${code(short(resolution.resolvedCommitSha))}. The integrator's rationale:`,
            "",
            quote(resolution.rationale.length === 0 ? "(no rationale given)" : resolution.rationale)
          ])
        ]),
    "",
    `### Validation: ${validation.status} on ${code(short(validation.commitSha))}`,
    "",
    "Checks ran offline in a read-only sandbox; only setup commands had network access.",
    "",
    "| Phase | Command | Exit | Duration |",
    "| --- | --- | --- | --- |",
    ...validationRows,
    ""
  ].join("\n")
}

/** Marker that lets recovery recognize a supersede comment it already posted. */
export const supersedeMarker = (handoffId: string): string => `<!-- evergreen-handoff:${handoffId} -->`

export const renderSupersedeComment = (handoffId: string, pullRequestUrl: string): string =>
  [supersedeMarker(handoffId), `Superseded by ${pullRequestUrl}, a newer integration attempt for this goal.`, ""].join("\n")
