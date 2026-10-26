/** @module Onboarding service tests against real Git: cited discovery, host-composed policy, factory-branch commit. */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { onboardingPacketSchema } from "@evergreen-terrace/contracts"
import type {
  OnboardingApplyCompletionInput,
  OnboardingDiscoveryCompletionInput,
  OnboardingStartInput
} from "@evergreen-terrace/contracts"
import { parseProjectPolicy } from "@evergreen-terrace/project-policy"
import type { CommandDecisionSnapshot, CommandOnboardingSnapshot } from "../command-api/command-api-client.types"
import type { ReadOnlyAgentPort, ReadOnlyAgentRun } from "../planning/read-only-agent.types"
import { ReadOnlyCheckouts } from "../planning/read-only-checkouts"
import { runProcess } from "../process/run-process"
import { GitWorkspace } from "../workspace/git-workspace"
import { OnboardingService } from "./onboarding-service"
import { RepositoryFacts } from "./repository-facts"

const identity = ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"]

const block = (value: unknown) => `Done.\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``

const report = (area: string) => ({
  findings: [
    {
      area,
      citations: [{ kind: "file", line: 3, path: "package.json" }],
      claim: "Tests run with bun test.",
      confidence: "high"
    },
    { area, citations: [{ kind: "file", line: null, path: "does/not/exist.ts" }], claim: "A guess.", confidence: "low" }
  ],
  proposals: { validationCommands: ["bun test"], validationSetup: [] }
})

const proposal = {
  allowedBaseRefs: ["main"],
  moduleMap: [{ path: "src", purpose: "Sources." }],
  profile: { projectConventions: ["Tests next to sources."] },
  protectedBranches: ["main"],
  validation: { commands: ["test -f package.json"], setup: [], timeoutSeconds: 60 },
  validationEvidence: [{ citations: [{ kind: "file", line: 3, path: "package.json" }], command: "test -f package.json" }]
}

/** Answers discovery prompts with a report and the consolidation prompt with the proposal. */
class ScriptedAgent implements ReadOnlyAgentPort {
  readonly runs: ReadOnlyAgentRun[] = []

  constructor(private readonly consolidation: unknown[]) {}

  async run(input: ReadOnlyAgentRun) {
    this.runs.push(input)
    const replies = input.label.startsWith("discovery:") ? [block(report("validation"))] : this.consolidation.map(block)
    let turns = 0
    let prompt: string | null = input.prompt
    while (prompt !== null) {
      prompt = (await input.continueWith?.(replies[turns] ?? "")) ?? null
      turns += 1
    }
    return { stopReason: "end_turn", turns }
  }
}

class FakeOnboardingApi {
  readonly decisions = new Map<string, CommandDecisionSnapshot>()
  readonly onboardings = new Map<string, CommandOnboardingSnapshot>()

  async listProjectOnboardings(projectId: string) {
    return [...this.onboardings.values()].filter((onboarding) => onboarding.projectId === projectId)
  }

  async getOnboarding(onboardingId: string) {
    const found = this.onboardings.get(onboardingId)
    if (found === undefined) {
      throw new Error(`no onboarding ${onboardingId}`)
    }
    return found
  }

  async getDecision(decisionId: string) {
    const found = this.decisions.get(decisionId)
    if (found === undefined) {
      throw new Error(`no decision ${decisionId}`)
    }
    return found
  }

  async startOnboarding(input: OnboardingStartInput) {
    const onboardingId = crypto.randomUUID()
    const revision = (await this.listProjectOnboardings(input.projectId)).length + 1
    this.onboardings.set(onboardingId, {
      decisionId: null,
      detail: "",
      discovery: input.discovery,
      feedback: input.feedback ?? "",
      id: onboardingId,
      packet: null,
      projectId: input.projectId,
      result: null,
      revision,
      revisionOf: input.revisionOf ?? null,
      status: "discovering"
    })
    return { created: true, onboardingId, revision, status: "discovering" as const }
  }

  async completeOnboardingDiscovery(onboardingId: string, input: OnboardingDiscoveryCompletionInput) {
    const current = await this.getOnboarding(onboardingId)
    if (input.status === "failed") {
      this.onboardings.set(onboardingId, { ...current, detail: input.detail, status: "failed" })
    } else {
      const decisionId = crypto.randomUUID()
      this.decisions.set(decisionId, {
        id: decisionId,
        options: [],
        resolution: null,
        status: "requested",
        title: "Onboard"
      })
      this.onboardings.set(onboardingId, {
        ...current,
        decisionId,
        packet: onboardingPacketSchema.parse(input.packet),
        status: "proposed"
      })
    }
    return {
      created: true,
      onboardingId,
      revision: current.revision,
      status: (await this.getOnboarding(onboardingId)).status
    }
  }

  async beginOnboardingApply(onboardingId: string) {
    const current = await this.getOnboarding(onboardingId)
    const decision = await this.getDecision(current.decisionId ?? "")
    if (decision.status === "requested") {
      throw new Error("awaiting approval")
    }
    const status = decision.resolution?.selectedOptionId === "approve" ? ("applying" as const) : ("declined" as const)
    this.onboardings.set(onboardingId, { ...current, status })
    return { onboardingId, resumed: false, status }
  }

  async completeOnboardingApply(onboardingId: string, input: OnboardingApplyCompletionInput) {
    const current = await this.getOnboarding(onboardingId)
    this.onboardings.set(onboardingId, {
      ...current,
      detail: input.detail ?? "",
      result: input.status === "applied" ? input.result : null,
      status: input.status
    })
    return { created: true, onboardingId, revision: current.revision, status: input.status }
  }

  approve(onboardingId: string, optionId = "approve") {
    const decisionId = this.onboardings.get(onboardingId)?.decisionId ?? ""
    this.decisions.set(decisionId, {
      id: decisionId,
      options: [],
      resolution: { note: "", selectedOptionId: optionId, status: "approved" },
      status: "approved",
      title: "Onboard"
    })
  }
}

describe("onboarding service", () => {
  let root = ""

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "et-onboarding-"))
  })

  afterAll(async () => {
    await rm(root, { force: true, recursive: true })
  })

  const repository = async (name: string) => {
    const projectRoot = join(root, name, "repo")
    await Bun.write(
      join(projectRoot, "package.json"),
      '{\n  "name": "fixture",\n  "scripts": { "test": "bun test" }\n}\n'
    )
    await Bun.write(join(projectRoot, "src", "index.ts"), "export {}\n")
    await runProcess(["git", "init", "--quiet", "--initial-branch=main"], projectRoot)
    await runProcess(
      ["git", "remote", "add", "origin", "https://user:secret@github.com/Example/Fixture.git"],
      projectRoot
    )
    await runProcess(["git", "add", "--all"], projectRoot)
    await runProcess(["git", ...identity, "commit", "--quiet", "-m", "base"], projectRoot)
    await runProcess(["git", "switch", "--quiet", "--create", "wip"], projectRoot)
    await Bun.write(join(projectRoot, "scratch.txt"), "the engineer's uncommitted work\n")
    const factoryRoot = join(root, name, "factory")
    const commandApi = new FakeOnboardingApi()
    const service = (agent: ReadOnlyAgentPort) =>
      new OnboardingService({
        agent,
        checkouts: new ReadOnlyCheckouts(factoryRoot, projectRoot),
        commandApi,
        committedPolicy: (sha) => new GitWorkspace(projectRoot).committedPolicy(sha),
        factoryRoot,
        facts: new RepositoryFacts(projectRoot),
        projectRoot,
        validation: {
          run: async (input) => ({
            completedAt: new Date().toISOString(),
            results: input.plan.checks.map((command) => ({
              command,
              durationMs: 1,
              exitCode: 0,
              phase: "check" as const,
              stderrPath: "/dev/null",
              stdoutPath: "/dev/null",
              timedOut: false
            })),
            startedAt: new Date().toISOString(),
            status: "passed" as const
          })
        }
      })
    return { commandApi, projectRoot, service }
  }

  test("discovers with cited, verified evidence and proposes a host-composed policy", async () => {
    const { commandApi, service } = await repository("discover")
    const agent = new ScriptedAgent([proposal])
    const started = await service(agent).discover({ adapter: "claude", remote: "origin", workers: 2 })
    const outcome = await started.completion

    expect(started.projectId).toBe("github.com/example/fixture")
    expect(outcome.status).toBe("proposed")
    expect(agent.runs.map((run) => run.label.split(":")[0])).toEqual(["discovery", "discovery", "mayor"])
    expect(agent.runs[0]?.prompt).toContain("https://github.com/Example/Fixture.git")
    expect(agent.runs.some((run) => run.prompt.includes("user:secret"))).toBe(false)

    const { packet } = await commandApi.getOnboarding(outcome.onboardingId)
    expect(packet?.facts.baseRef).toBe("main")
    expect(packet?.facts.activeBranch).toBe("wip")
    expect(packet?.discovery.map((entry) => entry.unverifiedCitations)).toEqual([
      ["does/not/exist.ts"],
      ["does/not/exist.ts"]
    ])
    const policy = parseProjectPolicy(packet?.configToml ?? "")
    expect(policy.project_id).toBe("github.com/example/fixture")
    expect(policy.validation.commands).toEqual(["test -f package.json"])
    expect(policy.risk.decision_required).toHaveLength(7)
  })

  test("asks the mayor again when a check has no cited evidence", async () => {
    const { service } = await repository("uncited")
    const uncited = { ...proposal, validation: { commands: ["make check"], setup: [], timeoutSeconds: 60 } }
    const agent = new ScriptedAgent([uncited, proposal])
    const outcome = await (await service(agent).discover({ adapter: "claude", remote: "origin", workers: 2 })).completion
    expect(outcome.status).toBe("proposed")
    expect(agent.runs.at(-1)?.label).toContain("mayor")
  })

  test("applies only the approved text on a new factory branch and leaves the active checkout alone", async () => {
    const { commandApi, projectRoot, service } = await repository("apply")
    const onboarding = service(new ScriptedAgent([proposal]))
    const outcome = await (await onboarding.discover({ adapter: "claude", remote: "origin", workers: 2 })).completion
    await expect(onboarding.apply({ onboardingId: outcome.onboardingId, validate: true })).rejects.toThrow(
      /awaiting approval/
    )
    commandApi.approve(outcome.onboardingId)

    const applied = await onboarding.apply({ onboardingId: outcome.onboardingId, validate: true })
    expect(applied.status).toBe("applied")
    if (applied.status !== "applied") {
      return
    }
    expect(applied.result.branch).toBe(`feature/et-onboarding-${outcome.onboardingId.slice(0, 8)}`)
    expect(applied.result.validation?.status).toBe("passed")
    const changed = await runProcess(["git", "diff", "--name-only", "main", applied.result.commitSha], projectRoot)
    expect(changed.stdout.trim()).toBe(".et/config.toml")
    const committed = await runProcess(["git", "show", `${applied.result.commitSha}:.et/config.toml`], projectRoot)
    expect(committed.stdout).toBe((await commandApi.getOnboarding(outcome.onboardingId)).packet?.configToml ?? "")

    expect((await runProcess(["git", "branch", "--show-current"], projectRoot)).stdout.trim()).toBe("wip")
    expect(await Bun.file(join(projectRoot, "scratch.txt")).text()).toBe("the engineer's uncommitted work\n")
    expect(await Bun.file(join(projectRoot, ".et", "config.toml")).exists()).toBe(false)
    expect((await runProcess(["git", "rev-parse", "main"], projectRoot)).stdout.trim()).toBe(
      (await commandApi.getOnboarding(outcome.onboardingId)).packet?.facts.baseSha ?? ""
    )
  })

  test("a declined packet commits nothing", async () => {
    const { commandApi, projectRoot, service } = await repository("decline")
    const onboarding = service(new ScriptedAgent([proposal]))
    const outcome = await (await onboarding.discover({ adapter: "claude", remote: "origin", workers: 2 })).completion
    commandApi.approve(outcome.onboardingId, "reject")
    expect((await onboarding.apply({ onboardingId: outcome.onboardingId, validate: false })).status).toBe("declined")
    expect((await runProcess(["git", "branch", "--list", "feature/*"], projectRoot)).stdout.trim()).toBe("")
  })
})
