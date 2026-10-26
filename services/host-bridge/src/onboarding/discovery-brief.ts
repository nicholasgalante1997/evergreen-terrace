/** @module Pure prompts for onboarding discovery agents and the mayor's consolidation. */

import type { DiscoveryArea, OnboardingFacts, VerifiedDiscoveryReport } from "@evergreen-terrace/contracts"
import type { ProjectPolicy } from "@evergreen-terrace/project-policy"

export interface DiscoveryAssignment {
  areas: DiscoveryArea[]
  key: string
}

/** Two to four independent agents; every area is covered by exactly one. */
export const discoveryAssignments = (workers: 2 | 3 | 4): DiscoveryAssignment[] => {
  switch (workers) {
    case 2:
      return [
        { areas: ["git", "topology", "conventions"], key: "structure" },
        { areas: ["validation", "risk"], key: "checks" }
      ]
    case 3:
      return [
        { areas: ["git", "topology"], key: "structure" },
        { areas: ["validation"], key: "checks" },
        { areas: ["risk", "conventions"], key: "risks" }
      ]
    case 4:
      return [
        { areas: ["git", "topology"], key: "structure" },
        { areas: ["validation"], key: "checks" },
        { areas: ["risk"], key: "risks" },
        { areas: ["conventions"], key: "conventions" }
      ]
  }
}

const areaGuide: Record<DiscoveryArea, string> = {
  conventions:
    "Documentation, contributor rules (CONTRIBUTING, AGENTS.md, CLAUDE.md, style guides), and coding conventions.",
  git: "Branches, release and protected-branch conventions, ignored paths (.gitignore), and how changes reach the default branch.",
  risk: "Dependency, secret, migration, release, and protected-branch risks: what could hurt if an agent changed it carelessly.",
  topology:
    "Packages, modules, and services; what each is for; ownership boundaries (CODEOWNERS); how they depend on each other.",
  validation:
    "Build, test, lint, and typecheck commands; how CI runs them; which need the network (dependency installs) and which run offline."
}

const reportShape = {
  findings: [
    {
      area: "validation",
      citations: [
        { kind: "file", line: 12, path: "package.json" },
        { command: "git log --oneline -n 5", excerpt: "abc123 Release 1.2", kind: "command" }
      ],
      claim: "One precise conclusion.",
      confidence: "high"
    }
  ],
  proposals: {
    protectedBranches: ["main"],
    risks: [{ category: "migration", detail: "db/migrations is applied on deploy." }],
    validationCommands: ["bun run typecheck", "bun test"],
    validationSetup: ["bun install --frozen-lockfile"]
  }
}

const header = (facts: OnboardingFacts): string[] => [
  `This directory is ${facts.projectId} at ${facts.baseRef} (${facts.baseSha}), mounted read-only.`,
  "Read whatever you need. Read-only commands such as ls, cat, grep, rg, find, git log, and git show are allowed;",
  "edits, network access, and every other command are refused.",
  "",
  "Facts the factory collected from Git itself:",
  "```json",
  JSON.stringify(facts, null, 2),
  "```"
]

export const discoveryPrompt = (input: {
  assignment: DiscoveryAssignment
  facts: OnboardingFacts
  feedback: string
}): string =>
  [
    "You are a discovery agent for Evergreen Terrace, a governed engineering factory, onboarding a repository.",
    "Your report helps the engineer approve the repository's operating policy. Other agents cover other areas independently.",
    "",
    ...header(input.facts),
    "",
    "## Your areas",
    ...input.assignment.areas.map((area) => `- ${area}: ${areaGuide[area]}`),
    ...(input.feedback.length === 0 ? [] : ["", "## The engineer's notes on the previous attempt", input.feedback]),
    "",
    "## Rules",
    "- Every finding cites a file (with a line when you can) or the read-only command you ran with an excerpt of its output.",
    "- Do not guess. If evidence is thin, say so and use confidence low.",
    "- Never copy secret values. Cite the file that holds a secret; do not quote it.",
    "- validationSetup lists dependency preparation, the only step allowed network access (prefer frozen lockfile installs).",
    "- validationCommands lists checks that run offline after setup. Propose only commands the repository actually defines.",
    "- Risk categories: credential, dependency, destructive, external_side_effect, migration, release, security.",
    "",
    "End your reply with exactly one ```json fenced block of this shape (1 to 40 findings):",
    "```json",
    JSON.stringify(reportShape, null, 2),
    "```"
  ].join("\n")

const proposalShape = {
  allowedBaseRefs: ["main"],
  ambiguities: [{ detail: "Reports disagree on X.", question: "Is dev a protected branch?" }],
  moduleMap: [{ path: "services/api", purpose: "HTTP API." }],
  profile: {
    candidateGlobalPreferences: ["Prefers small, reviewable pull requests."],
    immutablePolicy: ["Never commit to main directly (CONTRIBUTING.md)."],
    projectConventions: ["Tests live next to sources as *.test.ts."]
  },
  protectedBranches: ["main"],
  risks: [
    {
      category: "migration",
      citations: [{ kind: "file", line: null, path: "db/migrations" }],
      detail: "Applied on deploy."
    }
  ],
  validation: {
    commands: ["bun run typecheck", "bun test"],
    setup: ["bun install --frozen-lockfile"],
    timeoutSeconds: 1200
  },
  validationEvidence: [{ citations: [{ kind: "file", line: 8, path: "package.json" }], command: "bun test" }]
}

export const consolidationPrompt = (input: {
  existing: ProjectPolicy | null
  facts: OnboardingFacts
  feedback: string
  reports: readonly VerifiedDiscoveryReport[]
}): string =>
  [
    "You are the mayor of Evergreen Terrace. Consolidate the discovery reports below into one onboarding proposal the",
    "engineer approves or rejects as a single decision. You do not write the policy file: the factory composes it from",
    "your proposal and keeps identity, capacity, and the safety floor fixed.",
    "",
    ...header(input.facts),
    "",
    ...(input.existing === null
      ? ["No .et/config.toml exists at the base yet."]
      : ["The current .et/config.toml at the base, parsed:", "```json", JSON.stringify(input.existing, null, 2), "```"]),
    "",
    "## Discovery reports (file citations the factory could not verify are listed per report)",
    "```json",
    JSON.stringify(
      input.reports.map((report) => ({
        areas: report.areas,
        failure: report.failure,
        findings: report.report?.findings ?? [],
        key: report.key,
        proposals: report.report?.proposals ?? null,
        unverifiedCitations: report.unverifiedCitations
      })),
      null,
      2
    ),
    "```",
    ...(input.feedback.length === 0 ? [] : ["", "## The engineer's notes on the previous attempt", input.feedback]),
    "",
    "## Rules",
    "- Propose only validation commands and setup steps the reports cite. Give each one validationEvidence with citations.",
    "- validation.commands must run offline; anything needing the network belongs in setup.",
    `- allowedBaseRefs must be existing local branches: ${input.facts.localBranches.slice(0, 30).join(", ")}`,
    "- List an ambiguity whenever reports disagree or the evidence is thin, instead of choosing silently.",
    "- profile separates rules the repository states (immutablePolicy), project conventions, and preferences that might",
    "  generalize to the engineer's other projects (candidates only).",
    "",
    "End your reply with exactly one ```json fenced block of this shape:",
    "```json",
    JSON.stringify(proposalShape, null, 2),
    "```"
  ].join("\n")
