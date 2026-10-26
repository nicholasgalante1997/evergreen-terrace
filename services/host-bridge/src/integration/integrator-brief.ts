/** @module Pure brief for the conflict-resolving integrator agent. */

export interface IntegratorBriefInput {
  conflicted: { brief: string; role: string }
  goalTitle: string
  merged: ReadonlyArray<{ brief: string; role: string }>
  paths: readonly string[]
}

const quote = (text: string): string =>
  text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")

/**
 * The integrator's scope claim is exactly the conflicted files. The host, not
 * the agent, verifies the result and records the merge commit.
 */
export const renderIntegratorBrief = (input: IntegratorBriefInput): string =>
  [
    `You are the integrator for the goal "${input.goalTitle}".`,
    "",
    `This worktree is in the middle of a git merge. The work of ${input.merged.map((source) => source.role).join(", ") || "no earlier worker"} is already merged.`,
    `Merging the work of "${input.conflicted.role}" conflicted in these files:`,
    ...input.paths.map((path) => `- ${path}`),
    "",
    "Each worker's original brief, which states its intent:",
    ...input.merged.flatMap((source) => ["", `${source.role}:`, quote(source.brief)]),
    "",
    `${input.conflicted.role} (the conflicting side):`,
    quote(input.conflicted.brief),
    "",
    "Your task:",
    "1. Edit only the files listed above. Remove every conflict marker (<<<<<<<, =======, >>>>>>>) and keep the intent of both sides.",
    "2. Do not create, delete, or rename files, and do not edit any other file.",
    "3. Do not run git or any other shell command. The factory verifies and commits your resolution.",
    "4. Finish with a short rationale (under 15 lines) explaining how you resolved each file. It is recorded as review evidence.",
    "",
    "If the two intents genuinely cannot be reconciled, leave the markers in place and explain why in your final message."
  ].join("\n")
