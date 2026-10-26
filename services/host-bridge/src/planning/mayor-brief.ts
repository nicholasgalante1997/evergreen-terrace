/** @module Pure prompts for the mayor agent and the briefs it produces for planned workers. */

import type { MayorPlan, MayorTask } from "@evergreen-terrace/contracts"
import type { ProjectPolicy } from "@evergreen-terrace/project-policy"
import type { CommandGoalSnapshot } from "../command-api/command-api-client.types"

export interface ActiveClaim {
  goalId: string
  goalTitle: string
  scope: readonly string[]
  taskKey: string
}

export interface MayorPromptInput {
  activeClaims: readonly ActiveClaim[]
  /** The engineer's answers and revision notes, verbatim. */
  feedback: readonly string[]
  goal: CommandGoalSnapshot
  maximumTasks: number
  policy: ProjectPolicy
  preferences: ReadonlyArray<{ key: string; value: string }>
  previous: MayorPlan | null
}

const bullets = (items: readonly string[], empty = "- (none)"): string[] =>
  items.length === 0 ? [empty] : items.map((item) => `- ${item}`)

const outputShape = {
  contract: { acceptance: ["Testable criterion"], assumptions: ["Optional"], outOfScope: ["Optional"] },
  integrateAfterGoalIds: [],
  questions: [],
  risks: [{ category: "migration", detail: "What could go wrong", mitigation: "How the plan limits it" }],
  summary: "Two or three sentences on the approach.",
  tasks: [
    {
      acceptance: ["What this task must achieve"],
      brief: "Complete, self-contained instructions for the worker.",
      dependsOn: [],
      key: "api",
      role: "api-implementer",
      scope: ["src/api/**", "test/api/**"],
      title: "Short task title"
    }
  ],
  validation: { notes: ["Optional notes on how the .et checks cover the acceptance criteria"] }
}

export const mayorPrompt = (input: MayorPromptInput): string => {
  const { goal, policy } = input
  return [
    "You are the mayor of Evergreen Terrace, a governed engineering factory for one engineer. You plan work; you never write code.",
    "",
    `This directory is the repository at the goal's base commit ${goal.baseSha} (${goal.baseRef}), mounted read-only.`,
    "Read whatever you need. Read-only commands such as ls, cat, grep, rg, find, git log, and git show are allowed;",
    "edits, network access, and every other command are refused.",
    "",
    "## Goal",
    `Title: ${goal.title}`,
    `Priority: ${goal.priorityClass || "unspecified"}`,
    "Description:",
    goal.description,
    "References:",
    ...bullets(goal.references),
    "Constraints:",
    ...bullets(goal.constraints),
    "",
    "## Project policy (.et/config.toml). It is authoritative; never plan to change it.",
    `- At most ${input.maximumTasks} worker task(s) for this goal.`,
    `- After integration the factory validates with: ${policy.validation.commands.join("; ")}`,
    `- Protected branches (never touched): ${policy.branches.protected.join(", ")}`,
    `- These risk categories need an engineer decision: ${policy.risk.decision_required.join(", ")}`,
    "",
    "## Engineer preferences (style only; they never override policy)",
    ...bullets(input.preferences.map((preference) => `${preference.key}: ${preference.value}`)),
    "",
    "## Other active goals in this repository and their scope claims",
    ...bullets(
      input.activeClaims.map(
        (claim) => `goal ${claim.goalId} "${claim.goalTitle}", task ${claim.taskKey}: ${claim.scope.join(", ")}`
      )
    ),
    ...(input.previous === null
      ? []
      : [
          "",
          "## Your previous revision",
          input.previous.summary,
          ...input.previous.tasks.map((task) => `- ${task.key}: ${task.title} (${task.scope.join(", ")})`)
        ]),
    ...(input.feedback.length === 0
      ? []
      : ["", "## The engineer's answers and requested changes", ...bullets(input.feedback)]),
    "",
    "## How the factory runs your plan",
    "- Each task runs as one worker agent in its own worktree and branch, all created from the same base commit.",
    "- dependsOn only orders the schedule and the merge. A dependent worker does NOT see its prerequisite's changes;",
    "  if one task needs another's code to exist, make them a single task.",
    "- After every worker finishes, the factory merges their branches in dependency order and runs the validation commands.",
    "- A task's scope claim lists every file or glob it may change, including its tests and docs. A change outside the claim",
    "  blocks integration of the whole goal, so claim generously but precisely. Tasks whose claims share files must be",
    "  ordered by dependsOn; prefer claims that do not overlap at all.",
    "- A worker cannot see this conversation. Its brief must say what to change, where, why, and how to check it.",
    "",
    "## What to return",
    "1. A bounded contract: testable acceptance criteria, what is out of scope, and your assumptions.",
    `2. One to ${input.maximumTasks} tasks with unique keys and unique roles (lowercase, e.g. "api-implementer").`,
    "   The roles integration, integrator, mayor, and discovery are reserved.",
    "3. Risks, using these categories where they apply: credential, dependency, destructive, external_side_effect, migration, release, security, other.",
    "4. Questions, only for ambiguity that would change the plan materially. Each has two to four options and an",
    "   optional recommendation. When you ask questions, return no tasks; you will plan again once they are answered.",
    "5. integrateAfterGoalIds: other active goals whose work must land before this one because the claims overlap.",
    "",
    "End your reply with exactly one ```json fenced block of this shape:",
    "```json",
    JSON.stringify(outputShape, null, 2),
    "```"
  ].join("\n")
}

export interface PlannedWorkerBriefInput {
  goalTitle: string
  plan: MayorPlan
  planId: string
  revision: number
  task: MayorTask
  validationCommands: readonly string[]
}

/** The worker's whole prompt. The scope claim is restated here and enforced again at integration. */
export const plannedWorkerBrief = (input: PlannedWorkerBriefInput): string => {
  const { plan, task } = input
  return [
    `You are the "${task.role}" worker for the goal "${input.goalTitle}".`,
    `Your task is "${task.title}" (${task.key}) from plan ${input.planId}, revision ${input.revision}.`,
    "You work alone in a factory worktree created from the goal's base commit, on your own branch.",
    "Other workers handle the rest of the plan; their changes are not in your worktree.",
    "",
    "## Goal contract",
    "Acceptance:",
    ...bullets(plan.contract.acceptance),
    ...(plan.contract.outOfScope.length === 0 ? [] : ["Out of scope:", ...bullets(plan.contract.outOfScope)]),
    "",
    "## Your task",
    task.brief,
    "",
    "Acceptance for this task:",
    ...bullets(task.acceptance),
    "",
    "## Scope claim",
    "You may change only files matching:",
    ...bullets(task.scope),
    "Any change outside these paths blocks integration of the whole goal. If the task needs a file outside your",
    "claim, do not edit it: stop and explain what you need in your final message.",
    "",
    "## Rules",
    "- Do not push, open pull requests, or contact remote services.",
    "- Leave your changes uncommitted, and do not switch branches or touch history: Git metadata is read-only in your",
    "  sandbox, and the factory commits your output itself.",
    `- After integration the factory validates with: ${input.validationCommands.join("; ")}`,
    "- Finish with a short handoff summary: what changed, commands you ran and their results, limitations,",
    "  and anything the integrator should know."
  ].join("\n")
}
