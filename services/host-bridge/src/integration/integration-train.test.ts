/** @module Integration-train tests against real Git worktrees and the real validation sandbox. */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { integrationCompletionSchema } from "@evergreen-terrace/contracts"
import type {
  IntegrationCompletion,
  IntegrationCompletionInput,
  IntegrationStartInput,
  ValidationRecord
} from "@evergreen-terrace/contracts"
import { loadProjectPolicy } from "@evergreen-terrace/project-policy"
import type { CommandGoalSnapshot, CommandWorkerSnapshot } from "../command-api/command-api-client.types"
import { FactoryGit } from "../git/factory-git"
import { runProcess } from "../process/run-process"
import { ValidationRunner } from "../validation/validation-runner"
import { ValidationService } from "../validation/validation-service"
import { FactoryWorktreeManager } from "../worktrees/factory-worktree-manager"
import { ConflictIntegrator } from "./conflict-integrator"
import { IntegrationPreconditionError, IntegrationTrain } from "./integration-train"
import type { IntegrationTrainPorts } from "./integration-train.types"

const sandboxAvailable = Bun.spawnSync(["bwrap", "--ro-bind", "/", "/", "--unshare-net", "true"]).exitCode === 0

const policy = (checks: string[]) => `
version = 1
project_id = "github.com/example/train"
canonical_remote = "origin"
priority_classes = [{ name = "p1", weight = 50 }]

[goals]
max_concurrent = 4

[workers]
default_per_goal = 3
max_per_repository = 6

[branches]
protected = ["main", "dev"]
allowed_base_refs = ["main"]
classes = [{ name = "feature", prefix = "feature/" }]

[validation]
commands = [${checks.map((check) => JSON.stringify(check)).join(", ")}]

[risk]
decision_required = ["security"]
`

/** In-memory command API that applies the command service's evidence rules. */
class FakeEvidenceApi {
  readonly completions = new Map<string, IntegrationCompletion>()
  readonly starts: IntegrationStartInput[] = []
  readonly validations = new Map<string, ValidationRecord>()

  constructor(
    readonly goal: CommandGoalSnapshot,
    readonly workers: CommandWorkerSnapshot[]
  ) {}

  async getGoal() {
    return this.goal
  }

  async listGoalWorkers() {
    return this.workers
  }

  async startIntegration(input: IntegrationStartInput) {
    this.starts.push(input)
    return { attempt: this.starts.length, created: true, integrationId: crypto.randomUUID(), status: "started" }
  }

  async getIntegration(integrationId: string) {
    const completion = this.completions.get(integrationId)
    if (completion === undefined) {
      throw new Error(`unknown integration ${integrationId}`)
    }
    return {
      attempt: 1,
      baseRef: this.goal.baseRef,
      baseSha: this.goal.baseSha,
      completion,
      goalId: this.goal.id,
      id: integrationId,
      projectId: this.goal.projectId,
      status: completion.status
    }
  }

  async completeIntegration(integrationId: string, input: IntegrationCompletionInput) {
    const completion = integrationCompletionSchema.parse(input)
    if (completion.validationId !== null) {
      const validation = this.validations.get(completion.validationId)
      expect(validation?.subject).toEqual({ id: integrationId, type: "integration" })
      expect(validation?.commitSha).toBe(completion.headSha ?? "")
    }
    this.completions.set(integrationId, completion)
    return { completed: true, integrationId, status: completion.status }
  }

  async recordValidation(input: ValidationRecord) {
    const validationId = crypto.randomUUID()
    this.validations.set(validationId, input)
    return { created: true, status: input.status, validationId }
  }
}

describe.skipIf(!sandboxAvailable)("integration train", () => {
  let root = ""

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "et-train-"))
  })

  afterAll(async () => {
    await rm(root, { force: true, recursive: true })
  })

  const fixture = async (name: string, checks: string[]) => {
    const projectRoot = join(root, name, "repo")
    const factoryRoot = join(root, name, "factory")
    await Bun.write(join(projectRoot, ".et", "config.toml"), policy(checks))
    await Bun.write(join(projectRoot, "shared.txt"), "line one\nline two\n")
    await runProcess(["git", "init", "--quiet", "--initial-branch=main"], projectRoot)
    await runProcess(["git", "add", "--all"], projectRoot)
    await runProcess(
      [
        "git",
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@t",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--quiet",
        "-m",
        "base"
      ],
      projectRoot
    )
    const baseSha = (await runProcess(["git", "rev-parse", "HEAD"], projectRoot)).stdout.trim()
    const goalId = crypto.randomUUID()
    const worktrees = new FactoryWorktreeManager(factoryRoot, projectRoot)

    const worker = async (role: string, dependsOnWorkerIds: string[] = []): Promise<CommandWorkerSnapshot> => {
      const worktree = await worktrees.prepare({ attempt: 1, baseRef: "main", branchClass: "feature", goalId, role })
      return {
        adapter: "claude",
        briefSha256: "f".repeat(64),
        dependsOnWorkerIds,
        goalId,
        id: crypto.randomUUID(),
        idempotencyKey: `worker-${role}`,
        leaseExpiresAt: null,
        leaseOwner: null,
        projectId: "github.com/example/train",
        role,
        state: "completed",
        worktree: {
          artifactDirectory: worktree.artifactDirectory,
          attempt: 1,
          baseRef: "main",
          baseSha: worktree.baseSha,
          branch: worktree.branch,
          manifestPath: worktree.manifestPath,
          worktreePath: worktree.worktreePath
        }
      }
    }

    const train = (api: FakeEvidenceApi, integrator?: ConflictIntegrator, plans?: IntegrationTrainPorts["plans"]) =>
      new IntegrationTrain({
        commandApi: api,
        ...(integrator === undefined ? {} : { integrator }),
        ...(plans === undefined ? {} : { plans }),
        validation: new ValidationService(api, new ValidationRunner(join(factoryRoot, "cache")), () =>
          loadProjectPolicy(projectRoot)
        ),
        worktrees
      })

    return {
      baseSha,
      goal: {
        baseRef: "main",
        baseSha,
        constraints: [],
        description: "Train fixture.",
        id: goalId,
        priorityClass: "p1",
        projectId: "github.com/example/train",
        references: [],
        title: "Train fixture"
      },
      train,
      worker
    }
  }

  const commit = async (worktreePath: string, path: string, content: string) => {
    await Bun.write(join(worktreePath, path), content)
    await runProcess(["git", "add", "--all"], worktreePath)
    await runProcess(
      ["git", "-c", "user.name=w", "-c", "user.email=w@w", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", path],
      worktreePath
    )
  }

  test("merges in dependency order, captures uncommitted output, and validates the composed head", async () => {
    const { baseSha, goal, train, worker } = await fixture("clean", [
      "grep -q alpha alpha.txt && grep -q beta beta.txt",
      'touch "$HOME/.et-validation-escape" 2>/dev/null && exit 1 || exit 0'
    ])
    const schema = await worker("schema")
    const api = await worker("api", [schema.id])
    await commit(schema.worktree.worktreePath, "alpha.txt", "alpha\n")
    await Bun.write(join(api.worktree.worktreePath, "beta.txt"), "beta\n")
    const evidence = new FakeEvidenceApi(goal, [api, schema])

    const result = await train(evidence).run({ branchClass: "feature", goalId: goal.id })

    expect(result.completion.status).toBe("validated")
    expect(result.completion.branch).toBe(`feature/et-${goal.id}/integration`)
    expect(result.completion.mergeOrder).toEqual([schema.id, api.id])
    expect(result.completion.sources.find((source) => source.workerId === api.id)?.captureCommitSha).toMatch(
      /^[0-9a-f]{40}$/
    )
    expect(result.completion.sources.find((source) => source.workerId === schema.id)?.captureCommitSha).toBeNull()
    expect(result.completion.aggregateDiff).toEqual(expect.objectContaining({ filesChanged: 2, insertions: 2 }))
    expect(await Bun.file(result.completion.aggregateDiff?.path ?? "").text()).toContain("+beta")
    expect(evidence.starts[0]?.baseSha).toBe(baseSha)
    const [validation] = [...evidence.validations.values()]
    expect(validation?.results.map((entry) => entry.exitCode)).toEqual([0, 0])
    expect(await new FactoryGit(result.completion.worktreePath).isClean()).toBe(true)
  })

  test("aborts and records a conflict without leaving a half-merged worktree", async () => {
    const { goal, train, worker } = await fixture("conflict", ["true"])
    const left = await worker("left")
    const right = await worker("right")
    await commit(left.worktree.worktreePath, "shared.txt", "line one\nleft edit\n")
    await commit(right.worktree.worktreePath, "shared.txt", "line one\nright edit\n")
    const evidence = new FakeEvidenceApi(goal, [left, right])

    const result = await train(evidence).run({ branchClass: "feature", goalId: goal.id })

    expect(result.completion.status).toBe("conflicted")
    expect(result.completion.conflict).toEqual({ paths: ["shared.txt"], workerId: right.id })
    expect(result.completion.overlaps).toEqual([{ path: "shared.txt", workerIds: [left.id, right.id] }])
    expect(result.completion.validationId).toBeNull()
    expect(evidence.validations.size).toBe(0)
    expect(await new FactoryGit(result.completion.worktreePath).isClean()).toBe(true)
  })

  test("records validation_failed with offline checks and complete per-command evidence", async () => {
    const { goal, train, worker } = await fixture("failing", [
      "exit 3",
      "if command -v getent >/dev/null; then ! getent hosts example.com; fi"
    ])
    const only = await worker("only")
    await commit(only.worktree.worktreePath, "gamma.txt", "gamma\n")
    const evidence = new FakeEvidenceApi(goal, [only])

    const result = await train(evidence).run({ branchClass: "feature", goalId: goal.id })

    expect(result.completion.status).toBe("validation_failed")
    const [validation] = [...evidence.validations.values()]
    expect(validation?.status).toBe("failed")
    expect(validation?.results.map((entry) => entry.exitCode)).toEqual([3, 0])
  })

  test("blocks a planned worker that changed files outside its scope claim, before merging anything", async () => {
    const { goal, train, worker } = await fixture("plan-scope", ["true"])
    const api = await worker("api")
    const docs = await worker("docs")
    await commit(api.worktree.worktreePath, "api.txt", "api\n")
    await commit(api.worktree.worktreePath, "shared.txt", "line one\nsneaky\n")
    await commit(docs.worktree.worktreePath, "docs.md", "docs\n")
    const evidence = new FakeEvidenceApi(goal, [api, docs])
    const planId = crypto.randomUUID()
    const plans = {
      launchedClaims: async () => ({
        planId,
        workers: new Map([
          [api.id, { scope: ["api.txt"], taskKey: "api" }],
          [docs.id, { scope: ["docs.md"], taskKey: "docs" }]
        ])
      })
    }

    const result = await train(evidence, undefined, plans).run({ branchClass: "feature", goalId: goal.id })

    expect(result.completion.status).toBe("blocked")
    expect(result.completion.scopeViolations).toEqual([
      { paths: ["shared.txt"], planId, taskKey: "api", workerId: api.id }
    ])
    expect(result.completion.detail).toContain("outside its scope claim")
    expect(evidence.validations.size).toBe(0)
    expect(await Bun.file(join(result.completion.worktreePath, "api.txt")).exists()).toBe(false)

    const excluded = await train(evidence, undefined, plans).run({
      branchClass: "feature",
      excludeWorkerIds: [api.id],
      goalId: goal.id,
      selectionRationale: "api strayed outside its claim; integrate docs alone"
    })
    expect(excluded.completion.status).toBe("validated")
    expect(excluded.completion.scopeViolations).toEqual([])
  })

  test("refuses before recording anything while a worker is unsettled", async () => {
    const { goal, train, worker } = await fixture("unsettled", ["true"])
    const running = { ...(await worker("busy")), state: "running" as const }
    const evidence = new FakeEvidenceApi(goal, [running])

    await expect(train(evidence).run({ branchClass: "feature", goalId: goal.id })).rejects.toBeInstanceOf(
      IntegrationPreconditionError
    )
    expect(evidence.starts).toHaveLength(0)
  })

  test("kills a check that exceeds its timeout", async () => {
    const workdir = join(root, "timeout")
    await Bun.write(join(workdir, "artifacts", ".keep"), "")
    const result = await new ValidationRunner(join(root, "timeout-cache")).run({
      artifactDirectory: join(workdir, "artifacts"),
      plan: { checks: ["sleep 30"], setup: [], timeoutSeconds: 1 },
      worktreePath: workdir
    })

    expect(result.status).toBe("failed")
    expect(result.results[0]).toEqual(expect.objectContaining({ exitCode: null, timedOut: true }))
  })

  /**
   * Plays the integrator agent: the real ConflictIntegrator assigns a worker and
   * schedules it; this fake scheduler "runs" it by applying `act` to the worktree
   * and writing an ACP transcript, as a real session would.
   */
  const integratorFor = (
    briefs: Map<string, string>,
    act: (worktreePath: string) => Promise<void>,
    rationale = "Kept both edits in order: left first, then right."
  ) => {
    const assigned = new Map<string, { artifactDirectory: string; worktreePath: string }>()
    const prompts: string[] = []
    const integrator = new ConflictIntegrator({
      commandApi: {
        assignWorker: async (input) => {
          const workerId = crypto.randomUUID()
          expect(input.role).toBe("integrator")
          assigned.set(workerId, input.worktree)
          return { created: true, eventId: crypto.randomUUID(), state: "assigned" as const, workerId }
        },
        getWorkerBrief: async (workerId) => ({ prompt: briefs.get(workerId) ?? "", sha256: "f".repeat(64), workerId })
      },
      scheduler: {
        recordBriefs: async (entries) => {
          prompts.push(...entries.map((entry) => entry.prompt))
          return ""
        },
        start: (input) => {
          const workerId = input.workerIds?.[0] ?? ""
          const worktree = assigned.get(workerId)
          const completion = (async () => {
            if (worktree === undefined) {
              throw new Error("integrator was not assigned")
            }
            await act(worktree.worktreePath)
            const chunk = (text: string) =>
              JSON.stringify({
                kind: "session.update",
                payload: {
                  update: { content: { text, type: "text" }, messageId: "m-final", sessionUpdate: "agent_message_chunk" }
                }
              })
            await Bun.write(
              `${worktree.artifactDirectory}/acp.events.ndjson`,
              `${chunk(rationale.slice(0, 10))}\n${chunk(rationale.slice(10))}\n`
            )
            return {
              goalId: input.goalId,
              outcomes: [{ detail: "done", state: "completed" as const, workerId }],
              schedulerId: "test"
            }
          })()
          return { alreadyRunning: false, completion, goalId: input.goalId, schedulerId: "test" }
        }
      }
    })
    return { integrator, prompts }
  }

  const conflictingGoal = async (name: string, checks: string[]) => {
    const fx = await fixture(name, checks)
    const left = await fx.worker("left")
    const right = await fx.worker("right")
    await commit(left.worktree.worktreePath, "shared.txt", "line one\nleft edit\n")
    await commit(right.worktree.worktreePath, "shared.txt", "line one\nright edit\n")
    const briefs = new Map([
      [left.id, "Change line two to say left."],
      [right.id, "Change line two to say right."]
    ])
    const evidence = new FakeEvidenceApi(fx.goal, [left, right])
    const first = await fx.train(evidence).run({ branchClass: "feature", goalId: fx.goal.id })
    expect(first.completion.status).toBe("conflicted")
    return { ...fx, briefs, evidence, first, left, right }
  }

  test("the integrator resolves a conflict on a new attempt that the host verifies, commits, and revalidates", async () => {
    const { briefs, evidence, first, left, right, train } = await conflictingGoal("resolve", [
      "grep -q 'left edit' shared.txt && grep -q 'right edit' shared.txt && ! grep -q '<<<<<<<' shared.txt"
    ])
    const { integrator, prompts } = integratorFor(briefs, async (worktreePath) => {
      await Bun.write(join(worktreePath, "shared.txt"), "line one\nleft edit\nright edit\n")
    })

    const result = await train(evidence, integrator).resolve({
      adapter: "claude",
      branchClass: "feature",
      integrationId: first.integrationId
    })

    expect(evidence.starts.at(-1)?.resolvesIntegrationId).toBe(first.integrationId)
    expect(result.completion.status).toBe("validated")
    expect(result.completion.branch).toEndWith("/integration-a2")
    const [resolution] = result.completion.resolutions
    expect(resolution).toEqual(
      expect.objectContaining({
        conflictedWorkerId: right.id,
        paths: ["shared.txt"],
        rationale: "Kept both edits in order: left first, then right."
      })
    )
    const git = new FactoryGit(result.completion.worktreePath)
    expect(await git.parents(resolution?.resolvedCommitSha ?? "")).toHaveLength(2)
    expect(await git.isClean()).toBe(true)
    expect(prompts[0]).toContain("- shared.txt")
    expect(prompts[0]).toContain("> Change line two to say right.")
    expect(prompts[0]).toContain(`${left.role}:`)
  })

  test("a resolution that leaves conflict markers is refused and the merge is aborted", async () => {
    const { briefs, evidence, first, train } = await conflictingGoal("markers", ["true"])
    const { integrator } = integratorFor(briefs, async () => undefined)

    const result = await train(evidence, integrator).resolve({
      adapter: "claude",
      branchClass: "feature",
      integrationId: first.integrationId
    })

    expect(result.completion.status).toBe("conflicted")
    expect(result.completion.detail).toContain("Conflict markers remain in: shared.txt")
    expect(result.completion.resolutions).toEqual([])
    expect(await new FactoryGit(result.completion.worktreePath).mergeInProgress()).toBe(false)
    expect(await new FactoryGit(result.completion.worktreePath).isClean()).toBe(true)
  })

  test("an integrator that edits outside its scope claim is refused", async () => {
    const { briefs, evidence, first, train } = await conflictingGoal("scope", ["true"])
    const { integrator } = integratorFor(briefs, async (worktreePath) => {
      await Bun.write(join(worktreePath, "shared.txt"), "line one\nleft edit\nright edit\n")
      await Bun.write(join(worktreePath, ".et", "config.toml"), "# weakened policy\n")
      await Bun.write(join(worktreePath, "extra.txt"), "smuggled\n")
    })

    const result = await train(evidence, integrator).resolve({
      adapter: "claude",
      branchClass: "feature",
      integrationId: first.integrationId
    })

    expect(result.completion.status).toBe("conflicted")
    expect(result.completion.detail).toContain("outside its scope claim: changed .et/config.toml; added extra.txt")
    expect(await new FactoryGit(result.completion.worktreePath).isClean()).toBe(false)
  })

  test("an integrator that commits the merge itself is refused", async () => {
    const { briefs, evidence, first, train } = await conflictingGoal("tamper", ["true"])
    const { integrator } = integratorFor(briefs, async (worktreePath) => {
      await Bun.write(join(worktreePath, "shared.txt"), "line one\nboth\n")
      await runProcess(["git", "add", "--all"], worktreePath)
      await runProcess(
        [
          "git",
          "-c",
          "user.name=a",
          "-c",
          "user.email=a@a",
          "-c",
          "commit.gpgsign=false",
          "commit",
          "--quiet",
          "--no-edit"
        ],
        worktreePath
      )
    })

    const result = await train(evidence, integrator).resolve({
      adapter: "claude",
      branchClass: "feature",
      integrationId: first.integrationId
    })

    expect(result.completion.status).toBe("conflicted")
    expect(result.completion.detail).toContain("changed the merge state")
  })

  test("resolve refuses an attempt that is not conflicted and a bridge without an integrator", async () => {
    const { evidence, first, train } = await conflictingGoal("refuse", ["true"])
    await expect(
      train(evidence).resolve({ adapter: "claude", branchClass: "feature", integrationId: first.integrationId })
    ).rejects.toThrow("No integrator agent")
    evidence.completions.set(first.integrationId, { ...first.completion, status: "validation_failed" })
    const { integrator } = integratorFor(new Map(), async () => undefined)
    await expect(
      train(evidence, integrator).resolve({
        adapter: "claude",
        branchClass: "feature",
        integrationId: first.integrationId
      })
    ).rejects.toThrow("Only a conflicted integration")
  })

  test("selection excludes worker output with a rationale and never strands a dependent", async () => {
    const fx = await fixture("selection", ["test -f kept.txt && ! test -f dropped.txt"])
    const kept = await fx.worker("kept")
    const dropped = await fx.worker("dropped")
    const dependent = await fx.worker("dependent", [dropped.id])
    const integratorWorker = { ...(await fx.worker("integrator-old")), role: "integrator" }
    await commit(kept.worktree.worktreePath, "kept.txt", "kept\n")
    await commit(dropped.worktree.worktreePath, "dropped.txt", "dropped\n")
    const evidence = new FakeEvidenceApi(fx.goal, [kept, dropped, dependent, integratorWorker])
    const train = fx.train(evidence)

    await expect(
      train.run({ branchClass: "feature", excludeWorkerIds: [dropped.id], goalId: fx.goal.id })
    ).rejects.toThrow("requires a selection rationale")
    await expect(
      train.run({
        branchClass: "feature",
        excludeWorkerIds: [dropped.id],
        goalId: fx.goal.id,
        selectionRationale: "Out of scope."
      })
    ).rejects.toThrow("strands dependents")

    const result = await train.run({
      branchClass: "feature",
      excludeWorkerIds: [dropped.id, dependent.id],
      goalId: fx.goal.id,
      selectionRationale: "The dropped approach duplicated kept; superseded."
    })

    expect(result.completion.status).toBe("validated")
    expect(result.completion.sources.map((source) => source.role)).toEqual(["kept"])
    expect(result.completion.selection).toEqual({
      excludedWorkerIds: [dropped.id, dependent.id],
      rationale: "The dropped approach duplicated kept; superseded."
    })
  })
})
