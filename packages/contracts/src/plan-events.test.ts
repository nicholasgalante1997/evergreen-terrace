/** @module Mayor goal-plan contract tests: the graph and scope rules are enforced, not trusted. */

import { describe, expect, test } from "bun:test"
import { createPlanUpdatedEvent, mayorPlanSchema, planTaskOrder, scopePatternSchema } from "./plan-events"

const task = (key: string, dependsOn: string[] = [], role = key) => ({
  acceptance: ["It works."],
  brief: `Do ${key}.`,
  dependsOn,
  key,
  role,
  scope: [`src/${key}/**`],
  title: `Task ${key}`
})

const plan = (tasks: unknown[], extra: Record<string, unknown> = {}) => ({
  contract: { acceptance: ["The goal is met."] },
  summary: "Two tasks.",
  tasks,
  ...extra
})

describe("mayor plans", () => {
  test("accept a dependency graph and order it", () => {
    const parsed = mayorPlanSchema.parse(plan([task("api"), task("ui", ["api"])]))
    expect(planTaskOrder(parsed.tasks)).toEqual(["api", "ui"])
    expect(planTaskOrder([task("ui", ["api"]), task("api")])).toEqual(["api", "ui"])
  })

  test.each([
    ["a cycle", [task("a", ["b"]), task("b", ["a"])]],
    ["a self edge", [task("a", ["a"])]],
    ["an unknown dependency", [task("a", ["missing"])]],
    ["duplicate keys", [task("a"), task("a", [], "other")]],
    ["duplicate roles", [task("a", [], "same"), task("b", [], "same")]],
    ["a reserved role", [task("a", [], "integrator")]],
    ["more than six tasks", ["a", "b", "c", "d", "e", "f", "g"].map((key) => task(key))]
  ])("refuse %s", (_name, tasks) => {
    expect(mayorPlanSchema.safeParse(plan(tasks)).success).toBe(false)
  })

  test("need tasks unless the mayor is asking questions", () => {
    expect(mayorPlanSchema.safeParse(plan([])).success).toBe(false)
    const question = {
      id: "storage",
      options: [
        { detail: "Use Postgres.", id: "postgres", label: "Postgres" },
        { detail: "Use files.", id: "files", label: "Files" }
      ],
      question: "Where is state stored?",
      recommendedOptionId: "postgres"
    }
    expect(mayorPlanSchema.safeParse(plan([], { questions: [question] })).success).toBe(true)
    expect(
      mayorPlanSchema.safeParse(plan([], { questions: [{ ...question, recommendedOptionId: "nope" }] })).success
    ).toBe(false)
  })

  test("scope patterns stay inside the repository", () => {
    for (const pattern of ["src/**", "README.md", "packages/*/src/index.ts", ".et/config.toml"]) {
      expect(scopePatternSchema.safeParse(pattern).success).toBe(true)
    }
    for (const pattern of ["/etc/passwd", "../other", "src/../../x", "./src", "a\\b", ""]) {
      expect(scopePatternSchema.safeParse(pattern).success).toBe(false)
    }
  })
})

describe("plan.updated", () => {
  const base = {
    decisionId: null,
    detail: "",
    goalId: crypto.randomUUID(),
    id: crypto.randomUUID(),
    launch: null,
    mayor: { adapter: "claude" as const, artifactDirectory: "/tmp/et/mayor", checkoutPath: "/tmp/et/checkout" },
    overlaps: [],
    projectId: "github.com/example/repository",
    proposal: null,
    questionDecisionIds: [],
    revision: 1,
    revisionOf: null
  }
  const event = {
    actor: { id: "command-api", kind: "system" as const },
    causationId: null,
    correlationId: crypto.randomUUID(),
    sequence: 1
  }

  test("a drafting plan has no proposal; a proposed one must", () => {
    expect(createPlanUpdatedEvent({ ...event, plan: { ...base, status: "drafting" } }).aggregate.type).toBe("plan")
    expect(() => createPlanUpdatedEvent({ ...event, plan: { ...base, status: "proposed" } })).toThrow()
  })

  test("launch evidence is present exactly when launched", () => {
    const proposal = {
      contract: { acceptance: ["Done."], assumptions: [], outOfScope: [] },
      integrateAfterGoalIds: [],
      questions: [],
      risks: [],
      summary: "One task.",
      tasks: [{ ...task("api"), brief: undefined, briefLength: 7, briefSha256: "a".repeat(64) }].map(
        ({ brief: _brief, ...summary }) => summary
      ),
      validation: { notes: [] }
    }
    const launch = { workers: [{ taskKey: "api", workerId: crypto.randomUUID() }] }
    expect(() =>
      createPlanUpdatedEvent({ ...event, plan: { ...base, launch, proposal, status: "launched" } })
    ).not.toThrow()
    expect(() => createPlanUpdatedEvent({ ...event, plan: { ...base, proposal, status: "launched" } })).toThrow()
  })
})
