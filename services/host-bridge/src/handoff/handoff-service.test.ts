/** @module GitHub handoff tests against real Git (with a local bare remote) and a fake GitHub. */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
  HandoffCompletion,
  HandoffRequest,
  IntegrationCompletion,
  ValidationRecord
} from "@evergreen-terrace/contracts"
import { loadProjectPolicy } from "@evergreen-terrace/project-policy"
import type { CommandHandoffSnapshot, CommandIntegrationSnapshot } from "../command-api/command-api-client.types"
import type { GitHubPort, PullRequestCreation, PullRequestReference } from "../github/github.types"
import { runProcess, tryProcess } from "../process/run-process"
import { FactoryWorktreeManager } from "../worktrees/factory-worktree-manager"
import { HandoffService } from "./handoff-service"
import type { HandoffCommandPort } from "./handoff-service.types"

const policy = `
version = 1
project_id = "github.com/example/handoff"
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
commands = ["true"]

[risk]
decision_required = ["external_side_effect"]
`

const identity = ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"]

class FakeGitHub implements GitHubPort {
  readonly comments: Array<{ body: string; number: number; url: string }> = []
  readonly created: PullRequestCreation[] = []
  readonly open = new Map<string, PullRequestReference>()
  readonly bodies: string[] = []

  async findOpenPullRequest(_repository: string, head: string) {
    return this.open.get(head) ?? null
  }

  async createPullRequest(_repository: string, input: PullRequestCreation) {
    this.created.push(input)
    this.bodies.push(await Bun.file(input.bodyPath).text())
    const reference = {
      number: 10 + this.created.length,
      url: `https://github.com/example/handoff/pull/${10 + this.created.length}`
    }
    this.open.set(input.head, reference)
    return reference
  }

  async findCommentContaining(_repository: string, number: number, marker: string) {
    return this.comments.find((comment) => comment.number === number && comment.body.includes(marker))?.url ?? null
  }

  async commentOnPullRequest(_repository: string, number: number, bodyPath: string) {
    const url = `https://github.com/example/handoff/pull/${number}#comment-${this.comments.length + 1}`
    this.comments.push({ body: await Bun.file(bodyPath).text(), number, url })
    return url
  }
}

/** In-memory command API applying the command service's handoff state machine. */
class FakeHandoffApi implements HandoffCommandPort {
  decision: "requested" | "approved" | "rejected" = "requested"
  readonly handoffs = new Map<string, CommandHandoffSnapshot>()
  readonly completions: HandoffCompletion[] = []

  constructor(
    public integration: CommandIntegrationSnapshot,
    readonly previous: CommandHandoffSnapshot[] = []
  ) {}

  async getIntegration() {
    return this.integration
  }

  async getGoal(goalId: string) {
    return {
      baseRef: "main",
      baseSha: this.integration.baseSha,
      constraints: [],
      description: "Ship it.",
      id: goalId,
      priorityClass: "p1",
      projectId: "github.com/example/handoff",
      references: [],
      title: "Ship it"
    }
  }

  async findValidation(): Promise<ValidationRecord> {
    return {
      artifactDirectory: "/tmp/v",
      commitSha: this.integration.completion?.headSha ?? "",
      completedAt: new Date().toISOString(),
      goalId: this.integration.goalId,
      idempotencyKey: "v",
      projectId: "github.com/example/handoff",
      results: [
        {
          command: "true",
          durationMs: 1,
          exitCode: 0,
          phase: "check",
          stderrPath: "/tmp/e",
          stdoutPath: "/tmp/o",
          timedOut: false
        }
      ],
      startedAt: new Date().toISOString(),
      status: "passed",
      subject: { id: this.integration.id, type: "integration" }
    }
  }

  async listGoalHandoffs() {
    return [...this.previous, ...this.handoffs.values()]
  }

  async requestHandoff(input: HandoffRequest) {
    const id = crypto.randomUUID()
    this.handoffs.set(id, {
      body: input.body,
      decisionId: crypto.randomUUID(),
      detail: "",
      goalId: this.integration.goalId,
      id,
      integrationId: input.integrationId,
      plan: {
        ...input.plan,
        bodyLength: input.body.length,
        bodySha256: createHash("sha256").update(input.body).digest("hex")
      },
      projectId: "github.com/example/handoff",
      result: null,
      status: "requested"
    })
    return { created: true, decisionId: crypto.randomUUID(), handoffId: id, status: "requested" as const }
  }

  async getHandoff(handoffId: string) {
    const handoff = this.handoffs.get(handoffId)
    if (handoff === undefined) {
      throw new Error("missing handoff")
    }
    return { ...handoff }
  }

  async beginHandoff(handoffId: string) {
    const handoff = await this.getHandoff(handoffId)
    if (handoff.status === "executing") {
      return { handoffId, resumed: true, status: "executing" as const }
    }
    if (this.decision === "requested") {
      throw new Error("awaiting approval")
    }
    const status = this.decision === "approved" ? ("executing" as const) : ("declined" as const)
    this.handoffs.set(handoffId, { ...handoff, status })
    return { handoffId, resumed: false, status }
  }

  async completeHandoff(handoffId: string, completion: HandoffCompletion) {
    const handoff = await this.getHandoff(handoffId)
    expect(handoff.status).toBe("executing")
    this.completions.push(completion)
    this.handoffs.set(handoffId, {
      ...handoff,
      detail: completion.detail,
      result: completion.status === "completed" ? completion.result : null,
      status: completion.status
    })
  }
}

describe("GitHub handoff", () => {
  let root = ""

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "et-handoff-"))
  })

  afterAll(async () => {
    await rm(root, { force: true, recursive: true })
  })

  const fixture = async (name: string) => {
    const projectRoot = join(root, name, "repo")
    const remoteRoot = join(root, name, "remote.git")
    const factoryRoot = join(root, name, "factory")
    await runProcess(["git", "init", "--quiet", "--bare", remoteRoot], root)
    await Bun.write(join(projectRoot, ".et", "config.toml"), policy)
    await runProcess(["git", "init", "--quiet", "--initial-branch=main"], projectRoot)
    await runProcess(["git", "add", "--all"], projectRoot)
    await runProcess(["git", ...identity, "commit", "--quiet", "-m", "base"], projectRoot)
    await runProcess(["git", "remote", "add", "origin", remoteRoot], projectRoot)
    const baseSha = (await runProcess(["git", "rev-parse", "HEAD"], projectRoot)).stdout.trim()
    const goalId = crypto.randomUUID()
    const worktree = await new FactoryWorktreeManager(factoryRoot, projectRoot).prepare({
      attempt: 1,
      baseRef: "main",
      branchClass: "feature",
      goalId,
      role: "integration"
    })
    await Bun.write(join(worktree.worktreePath, "feature.txt"), "integrated\n")
    await runProcess(["git", "add", "--all"], worktree.worktreePath)
    await runProcess(["git", ...identity, "commit", "--quiet", "-m", "integrate"], worktree.worktreePath)
    const headSha = (await runProcess(["git", "rev-parse", "HEAD"], worktree.worktreePath)).stdout.trim()
    const completion: IntegrationCompletion = {
      aggregateDiff: {
        deletions: 0,
        filesChanged: 1,
        insertions: 1,
        path: join(worktree.artifactDirectory, "aggregate.diff"),
        sha256: "a".repeat(64)
      },
      artifactDirectory: worktree.artifactDirectory,
      branch: worktree.branch,
      conflict: null,
      detail: "",
      scopeViolations: [],
      headSha,
      mergeOrder: [],
      overlaps: [],
      resolutions: [],
      selection: null,
      sources: [],
      status: "validated",
      validationId: crypto.randomUUID(),
      worktreePath: worktree.worktreePath
    }
    const integration: CommandIntegrationSnapshot = {
      attempt: 1,
      baseRef: "main",
      baseSha,
      completion,
      goalId,
      id: crypto.randomUUID(),
      projectId: "github.com/example/handoff",
      status: "validated"
    }
    const remoteSha = async (): Promise<string | null> => {
      const result = await tryProcess(["git", "rev-parse", "--verify", `refs/heads/${worktree.branch}`], remoteRoot)
      return result.exitCode === 0 ? result.stdout.trim() : null
    }
    const service = (api: FakeHandoffApi, github: FakeGitHub) =>
      new HandoffService({
        commandApi: api,
        github,
        loadPolicy: () => loadProjectPolicy(projectRoot),
        workDirectory: join(factoryRoot, "handoffs")
      })
    return { headSha, integration, remoteRoot, remoteSha, service, worktree }
  }

  test("does nothing external until the decision card approves, then pushes and opens the PR once", async () => {
    const { headSha, integration, remoteSha, service, worktree } = await fixture("approve")
    const api = new FakeHandoffApi(integration)
    const github = new FakeGitHub()
    const handoffs = service(api, github)

    const requested = await handoffs.request(integration.id)
    expect(requested.plan).toEqual(
      expect.objectContaining({
        baseRef: "main",
        branch: worktree.branch,
        headSha,
        remote: "origin",
        repository: "example/handoff"
      })
    )
    await expect(handoffs.execute(requested.handoffId)).rejects.toThrow("awaiting approval")
    expect(await remoteSha()).toBeNull()
    expect(github.created).toHaveLength(0)

    api.decision = "approved"
    const executed = await handoffs.execute(requested.handoffId)

    expect(executed).toEqual(expect.objectContaining({ status: "completed" }))
    expect(await remoteSha()).toBe(headSha)
    expect(github.created).toEqual([expect.objectContaining({ base: "main", head: worktree.branch, title: "Ship it" })])
    expect(github.bodies[0]).toBe((await api.getHandoff(requested.handoffId)).body)
    expect(github.bodies[0]).not.toContain(root)
    expect(await handoffs.execute(requested.handoffId)).toEqual(expect.objectContaining({ status: "completed" }))
    expect(github.created).toHaveLength(1)
  })

  test("a declined card never contacts the remote", async () => {
    const { integration, remoteSha, service } = await fixture("decline")
    const api = new FakeHandoffApi(integration)
    const github = new FakeGitHub()
    const handoffs = service(api, github)
    const { handoffId } = await handoffs.request(integration.id)
    api.decision = "rejected"

    expect(await handoffs.execute(handoffId)).toEqual({ handoffId, status: "declined" })
    expect(await remoteSha()).toBeNull()
    expect(github.created).toHaveLength(0)
  })

  test("recovery after a crash reconciles finished steps instead of repeating them", async () => {
    const { headSha, integration, remoteRoot, remoteSha, service, worktree } = await fixture("recover")
    const api = new FakeHandoffApi(integration)
    const github = new FakeGitHub()
    const handoffs = service(api, github)
    const { handoffId } = await handoffs.request(integration.id)
    api.decision = "approved"
    await api.beginHandoff(handoffId)
    await runProcess(
      ["git", "push", "--quiet", remoteRoot, `${headSha}:refs/heads/${worktree.branch}`],
      worktree.worktreePath
    )
    github.open.set(worktree.branch, { number: 4, url: "https://github.com/example/handoff/pull/4" })

    const executed = await handoffs.execute(handoffId)

    expect(executed.status).toBe("completed")
    expect(executed.status === "completed" && executed.result.reconciledSteps).toEqual(["push", "pull_request"])
    expect(executed.status === "completed" && executed.result.pullRequest.number).toBe(4)
    expect(github.created).toHaveLength(0)
    expect(await remoteSha()).toBe(headSha)
  })

  test("never force-pushes over a diverged remote branch", async () => {
    const { integration, remoteRoot, remoteSha, service, worktree } = await fixture("diverged")
    const other = join(root, "diverged", "other")
    await runProcess(["git", "clone", "--quiet", remoteRoot, other], root)
    await Bun.write(join(other, "unrelated.txt"), "someone else\n")
    await runProcess(["git", "checkout", "--quiet", "-b", worktree.branch], other)
    await runProcess(["git", "add", "--all"], other)
    await runProcess(["git", ...identity, "commit", "--quiet", "-m", "unrelated"], other)
    await runProcess(["git", "push", "--quiet", "origin", worktree.branch], other)
    const foreign = await remoteSha()
    const api = new FakeHandoffApi(integration)
    const github = new FakeGitHub()
    const handoffs = service(api, github)
    const { handoffId } = await handoffs.request(integration.id)
    api.decision = "approved"

    const executed = await handoffs.execute(handoffId)

    expect(executed.status).toBe("failed")
    expect(executed.status === "failed" && executed.detail).toMatch(/rejected|non-fast-forward|fetch first/)
    expect(await remoteSha()).toBe(foreign)
    expect(github.created).toHaveLength(0)
    expect(api.completions.at(-1)?.status).toBe("failed")
  })

  test("refuses to request when the integration moved after validation or was not validated", async () => {
    const { integration, service, worktree } = await fixture("moved")
    const github = new FakeGitHub()
    await expect(
      service(new FakeHandoffApi({ ...integration, status: "conflicted" }), github).request(integration.id)
    ).rejects.toThrow("Only a validated integration")
    await Bun.write(join(worktree.worktreePath, "late.txt"), "late\n")
    await runProcess(["git", "add", "--all"], worktree.worktreePath)
    await runProcess(["git", ...identity, "commit", "--quiet", "-m", "late"], worktree.worktreePath)
    await expect(service(new FakeHandoffApi(integration), github).request(integration.id)).rejects.toThrow(
      "moved since validation"
    )
  })

  test("comments once on the superseded goal PR, recognizing its own comment on retry", async () => {
    const { integration, service } = await fixture("supersede")
    const previous: CommandHandoffSnapshot = {
      body: "old",
      decisionId: crypto.randomUUID(),
      detail: "",
      goalId: integration.goalId,
      id: crypto.randomUUID(),
      integrationId: crypto.randomUUID(),
      plan: {
        baseRef: "main",
        bodyLength: 3,
        bodySha256: "b".repeat(64),
        branch: "feature/et-old/integration",
        headSha: "c".repeat(40),
        remote: "origin",
        repository: "example/handoff",
        supersedesPullRequest: null,
        title: "Ship it"
      },
      projectId: "github.com/example/handoff",
      result: {
        pullRequest: { number: 3, url: "https://github.com/example/handoff/pull/3" },
        pushedSha: "c".repeat(40),
        reconciledSteps: [],
        supersedeCommentUrl: null
      },
      status: "completed"
    }
    const api = new FakeHandoffApi(integration, [previous])
    const github = new FakeGitHub()
    const handoffs = service(api, github)
    const requested = await handoffs.request(integration.id)
    expect(requested.plan.supersedesPullRequest).toBe(3)
    api.decision = "approved"

    await handoffs.execute(requested.handoffId)
    const handoff = await api.getHandoff(requested.handoffId)
    api.handoffs.set(requested.handoffId, { ...handoff, result: null, status: "executing" })
    const retried = await handoffs.execute(requested.handoffId)

    expect(github.comments).toHaveLength(1)
    expect(github.comments[0]?.body).toContain("Superseded by https://github.com/example/handoff/pull/11")
    expect(retried.status === "completed" && retried.result.reconciledSteps).toEqual([
      "push",
      "pull_request",
      "supersede_comment"
    ])
  })
})
