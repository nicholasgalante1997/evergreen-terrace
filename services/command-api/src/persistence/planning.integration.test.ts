/** @module Mayor plan, onboarding, and preference command integration tests against a disposable PostgreSQL. */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { SQL } from "bun"
import type { MayorPlan, OnboardingPacket } from "@evergreen-terrace/contracts"
import { CommandDatabase } from "./command-database"

const url = process.env["ET_TEST_COMMAND_DATABASE_URL"]
const run = crypto.randomUUID()
const projectId = `github.com/example/planning-${run.slice(0, 8)}`
const baseSha = "1".repeat(40)
const mayor = { adapter: "claude" as const, artifactDirectory: "/tmp/it/mayor", checkoutPath: "/tmp/it/mayor/checkout" }

const proposal = (extra: Partial<MayorPlan> = {}): MayorPlan => ({
  contract: { acceptance: ["The API and UI ship."], assumptions: [], outOfScope: ["Billing."] },
  integrateAfterGoalIds: [],
  questions: [],
  risks: [{ category: "migration", detail: "Adds a table.", mitigation: "Additive only." }],
  summary: "API first, then UI.",
  tasks: [
    {
      acceptance: ["Route exists."],
      brief: "SECRET-BRIEF-API build the route.",
      dependsOn: [],
      key: "api",
      role: "api",
      scope: ["src/api/**"],
      title: "API"
    },
    {
      acceptance: ["Page renders."],
      brief: "Build the page.",
      dependsOn: ["api"],
      key: "ui",
      role: "ui",
      scope: ["src/ui/**"],
      title: "UI"
    }
  ],
  validation: { notes: [] },
  ...extra
})

describe.skipIf(url === undefined)("planning commands (PostgreSQL)", () => {
  const database = new CommandDatabase(url ?? "")
  const raw = new SQL(url ?? "")

  const goal = async (label: string) =>
    (
      await database.submitGoal({
        baseRef: "main",
        baseSha,
        constraints: ["No new dependencies."],
        description: `Planning fixture ${label}.`,
        idempotencyKey: `goal-${label}-${run}`,
        priorityClass: "p1",
        projectId,
        references: ["docs/spec.md"],
        title: `Goal ${label}`
      })
    ).goalId

  const worker = async (goalId: string, role: string) =>
    (
      await database.assignWorker({
        adapter: "claude",
        dependsOnWorkerIds: [],
        goalId,
        idempotencyKey: `worker-${role}-${goalId}`,
        projectId,
        role,
        worktree: {
          artifactDirectory: `/tmp/it/${role}/a`,
          attempt: 1,
          baseRef: "main",
          baseSha,
          branch: `feature/et-${goalId}/${role}`,
          manifestPath: `/tmp/it/${role}/m.json`,
          worktreePath: `/tmp/it/${role}/wt`
        }
      })
    ).workerId

  beforeAll(async () => {
    await database.connect()
  })

  afterAll(async () => {
    await database.close()
    await raw.close()
  })

  test("the goal contract keeps its references and constraints", async () => {
    const stored = await database.getGoal(await goal("contract"))
    expect(stored.description).toBe("Planning fixture contract.")
    expect(stored.references).toEqual(["docs/spec.md"])
    expect(stored.constraints).toEqual(["No new dependencies."])
  })

  test("a proposed plan launches only after approval, with exactly one worker per task", async () => {
    const goalId = await goal("launch")
    const started = await database.startPlanDraft({ goalId, idempotencyKey: `draft-${run}`, mayor })
    expect(started.status).toBe("drafting")
    expect((await database.startPlanDraft({ goalId, idempotencyKey: `draft-${run}`, mayor })).created).toBe(false)
    await expect(
      database.startPlanDraft({ goalId, idempotencyKey: `draft-2-${run}`, mayor, revisionOf: started.planId })
    ).rejects.toThrow(/still drafting/)

    const proposed = await database.completePlanDraft(started.planId, {
      flaggedRisks: ["migration"],
      proposal: proposal(),
      status: "proposed"
    })
    expect(proposed.status).toBe("proposed")
    const decision = await database.getDecision(proposed.decisionId ?? "")
    expect(decision.category).toBe("plan_approval")
    expect(decision.context).toContain("1. api (role api): API")
    expect(decision.context).toContain("2. ui (role ui): UI")
    expect(decision.context).toContain("requires a decision under .et")
    expect(decision.context).not.toContain("SECRET-BRIEF-API")

    await expect(database.beginPlanLaunch(started.planId)).rejects.toThrow(/awaiting approval/)
    await database.resolveDecision(decision.id, { note: "", selectedOptionId: "approve", status: "approved" })
    await expect(
      database.startPlanDraft({ goalId, idempotencyKey: `draft-3-${run}`, mayor, revisionOf: started.planId })
    ).rejects.toThrow(/approved; launch it/)
    expect((await database.beginPlanLaunch(started.planId)).status).toBe("launching")
    expect((await database.beginPlanLaunch(started.planId)).resumed).toBe(true)

    const api = await worker(goalId, "api")
    const ui = await worker(goalId, "ui")
    await expect(
      database.completePlanLaunch(started.planId, { workers: [{ taskKey: "api", workerId: api }] })
    ).rejects.toThrow(/exactly one worker for every planned task/)
    const otherGoalWorker = await worker(await goal("other"), "ui")
    await expect(
      database.completePlanLaunch(started.planId, {
        workers: [
          { taskKey: "api", workerId: api },
          { taskKey: "ui", workerId: otherGoalWorker }
        ]
      })
    ).rejects.toThrow(/does not belong/)
    const launched = await database.completePlanLaunch(started.planId, {
      workers: [
        { taskKey: "api", workerId: api },
        { taskKey: "ui", workerId: ui }
      ]
    })
    expect(launched.status).toBe("launched")

    const stored = await database.getPlan(started.planId)
    expect(stored.proposal?.tasks[0]?.brief).toContain("SECRET-BRIEF-API")
    const published = await raw`
      SELECT envelope::text AS envelope FROM evergreen.outbox WHERE envelope->'aggregate'->>'id' = ${started.planId}
    `
    expect(published).toHaveLength(4)
    expect(published.some((row: { envelope: string }) => row.envelope.includes("SECRET-BRIEF-API"))).toBe(false)
    const active = await database.listActiveProjectPlans(projectId)
    expect(active.map((plan) => plan.id)).toContain(started.planId)
  })

  test("questions become ambiguity cards, and the next revision waits for their answers", async () => {
    const goalId = await goal("questions")
    const started = await database.startPlanDraft({ goalId, idempotencyKey: `q-${run}`, mayor })
    const question = {
      id: "store",
      options: [
        { detail: "Postgres.", id: "postgres", label: "Postgres" },
        { detail: "Files.", id: "files", label: "Files" }
      ],
      question: "Where should state live?",
      recommendedOptionId: "postgres"
    }
    const needsInput = await database.completePlanDraft(started.planId, {
      proposal: proposal({ questions: [question], tasks: [] }),
      status: "proposed"
    })
    expect(needsInput.status).toBe("needs_input")
    const plan = await database.getPlan(started.planId)
    expect(plan.questionDecisionIds).toHaveLength(1)
    const card = await database.getDecision(plan.questionDecisionIds[0] ?? "")
    expect(card.category).toBe("ambiguity")
    expect(card.recommendedOptionId).toBe("postgres")

    await expect(
      database.startPlanDraft({ goalId, idempotencyKey: `q2-${run}`, mayor, revisionOf: started.planId })
    ).rejects.toThrow(/Answer the mayor's question/)
    await expect(database.startPlanDraft({ goalId, idempotencyKey: `q2-${run}`, mayor })).rejects.toThrow(
      /must revise the latest plan/
    )
    await database.resolveDecision(card.id, { note: "", selectedOptionId: "files", status: "approved" })
    const revision = await database.startPlanDraft({
      feedback: "Use files.",
      goalId,
      idempotencyKey: `q2-${run}`,
      mayor,
      revisionOf: started.planId
    })
    expect(revision.revision).toBe(2)
    await database.completePlanDraft(revision.planId, { detail: "Mayor session crashed.", status: "failed" })
    expect((await database.getPlan(revision.planId)).status).toBe("failed")
  })

  test("a revise resolution rejects the plan and carries the engineer's note", async () => {
    const goalId = await goal("revise")
    const started = await database.startPlanDraft({ goalId, idempotencyKey: `r-${run}`, mayor })
    const proposed = await database.completePlanDraft(started.planId, { proposal: proposal(), status: "proposed" })
    await database.resolveDecision(proposed.decisionId ?? "", {
      note: "Split the UI task.",
      selectedOptionId: "revise",
      status: "approved"
    })
    const begun = await database.beginPlanLaunch(started.planId)
    expect(begun.status).toBe("rejected")
    expect((await database.getPlan(started.planId)).detail).toContain("Split the UI task.")
    expect(
      (await database.startPlanDraft({ goalId, idempotencyKey: `r2-${run}`, mayor, revisionOf: started.planId })).revision
    ).toBe(2)
  })

  test("onboarding gates the exact policy text behind one decision", async () => {
    const onboardingProject = `github.com/example/onboarding-${run.slice(0, 8)}`
    const discovery = {
      adapter: "claude" as const,
      baseRef: "main",
      baseSha,
      workers: ["structure", "checks"].map((key) => ({
        areas: ["topology" as const],
        artifactDirectory: `/tmp/it/d/${key}`,
        checkoutPath: `/tmp/it/d/${key}/checkout`,
        key
      }))
    }
    const started = await database.startOnboarding({
      discovery,
      idempotencyKey: `onb-${run}`,
      projectId: onboardingProject
    })
    expect(started.status).toBe("discovering")
    await expect(
      database.startOnboarding({
        discovery,
        idempotencyKey: `onb-2-${run}`,
        projectId: onboardingProject,
        revisionOf: started.onboardingId
      })
    ).rejects.toThrow(/still discovering/)
    const configToml = 'version = 1\nproject_id = "x"\n'
    const packet: OnboardingPacket = {
      configSha256: createHash("sha256").update(configToml).digest("hex"),
      configToml,
      discovery: [
        {
          areas: ["topology"],
          artifactDirectory: "/tmp/it/d/structure",
          failure: null,
          key: "structure",
          report: {
            findings: [
              {
                area: "topology",
                citations: [{ kind: "file", line: null, path: "README.md" }],
                claim: "One package.",
                confidence: "high"
              }
            ],
            proposals: { protectedBranches: [], risks: [], validationCommands: ["bun test"], validationSetup: [] }
          },
          unverifiedCitations: ["missing.ts"]
        }
      ],
      facts: {
        activeBranch: "main",
        baseRef: "main",
        baseSha,
        collectedAt: new Date().toISOString(),
        defaultBranch: "main",
        existingPolicy: false,
        headSha: baseSha,
        localBranches: ["main"],
        manifests: ["package.json"],
        projectId: onboardingProject,
        remote: { name: "origin", url: "git@github.com:example/onboarding.git" },
        topLevel: ["README.md"],
        trackedFileCount: 3
      },
      proposal: {
        allowedBaseRefs: ["main"],
        ambiguities: [{ detail: "", question: "Is dev protected?" }],
        moduleMap: [],
        profile: { candidateGlobalPreferences: [], immutablePolicy: [], projectConventions: [] },
        protectedBranches: ["main"],
        risks: [],
        validation: { commands: ["bun test"], setup: [], timeoutSeconds: 600 },
        validationEvidence: [
          { citations: [{ command: "cat package.json", excerpt: "", kind: "command" }], command: "bun test" }
        ]
      }
    }
    await expect(
      database.completeOnboardingDiscovery(started.onboardingId, {
        packet: { ...packet, configSha256: "0".repeat(64) },
        status: "proposed"
      })
    ).rejects.toThrow(/configSha256/)
    const proposed = await database.completeOnboardingDiscovery(started.onboardingId, { packet, status: "proposed" })
    const decision = await database.getDecision(proposed.decisionId ?? "")
    expect(decision.category).toBe("onboarding")
    expect(decision.context).toContain(configToml.trim())
    expect(decision.context).toContain("1 citation(s) could not be verified")
    expect(decision.context).toContain("Is dev protected?")

    await expect(database.beginOnboardingApply(started.onboardingId)).rejects.toThrow(/awaiting approval/)
    await database.resolveDecision(decision.id, { note: "", selectedOptionId: "approve", status: "approved" })
    expect((await database.beginOnboardingApply(started.onboardingId)).status).toBe("applying")
    await database.completeOnboardingApply(started.onboardingId, { detail: "worktree add failed", status: "failed" })
    expect((await database.beginOnboardingApply(started.onboardingId)).status).toBe("applying")
    const result = {
      branch: "feature/et-onboarding",
      commitSha: "2".repeat(40),
      validation: null,
      worktreePath: "/tmp/it/onb"
    }
    expect((await database.completeOnboardingApply(started.onboardingId, { result, status: "applied" })).status).toBe(
      "applied"
    )
    const events = await raw`
      SELECT envelope->'payload'->'onboarding'->>'status' AS status FROM evergreen.events
      WHERE aggregate_id = ${started.onboardingId} ORDER BY aggregate_sequence
    `
    expect(events.map((row: { status: string }) => row.status)).toEqual([
      "discovering",
      "proposed",
      "applying",
      "failed",
      "applying",
      "applied"
    ])
    const revision = await database.startOnboarding({
      discovery,
      idempotencyKey: `onb-3-${run}`,
      projectId: onboardingProject,
      revisionOf: started.onboardingId
    })
    expect(revision.revision).toBe(2)
  })

  test("low-impact preferences promote themselves; material ones settle with their decision", async () => {
    const key = `reports.length_${run.slice(0, 8)}`
    const base = {
      category: "verbosity" as const,
      key,
      projectId: null,
      rationale: "Trimmed reports.",
      scope: "global" as const
    }
    const automatic = await database.proposePreference({
      ...base,
      evidence: ["e1", "e2"],
      idempotencyKey: `p1-${run}`,
      value: "short"
    })
    expect(automatic).toMatchObject({ route: "automatic", status: "promoted" })

    const changing = await database.proposePreference({
      ...base,
      evidence: ["e3", "e4"],
      idempotencyKey: `p2-${run}`,
      value: "long"
    })
    expect(changing).toMatchObject({ route: "decision", status: "proposed" })
    const card = await database.getDecision(changing.decisionId ?? "")
    expect(card.category).toBe("preference")
    expect(card.context).toContain("It replaces the current value: short")

    await database.resolveDecision(card.id, { note: "", selectedOptionId: "promote", status: "approved" })
    const profile = await database.listPreferences(null, true)
    const current = profile.filter((preference) => preference.key === key)
    expect(current).toHaveLength(1)
    expect(current[0]?.value).toBe("long")
    const all = (await database.listPreferences(null, false)).filter((preference) => preference.key === key)
    expect(all.find((preference) => preference.id === automatic.preferenceId)?.status).toBe("superseded")

    const convention = await database.proposePreference({
      ...base,
      category: "language_convention",
      evidence: ["e5", "e6"],
      idempotencyKey: `p3-${run}`,
      key: `${key}_style`,
      value: "early returns"
    })
    await database.resolveDecision(convention.decisionId ?? "", {
      note: "",
      selectedOptionId: "reject",
      status: "approved"
    })
    const rejected = (await database.listPreferences(null, false)).find(
      (preference) => preference.id === convention.preferenceId
    )
    expect(rejected?.status).toBe("rejected")
  })
})
