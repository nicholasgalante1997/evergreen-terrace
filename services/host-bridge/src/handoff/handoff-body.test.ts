/** @module Pull-request body rendering tests. */

import { expect, test } from "bun:test"
import { renderHandoffBody, renderSupersedeComment, supersedeMarker } from "./handoff-body"

const worker = { a: "11111111-1111-4111-8111-111111111111", b: "22222222-2222-4222-8222-222222222222" }
const home = "/home/engineer/.local/state/evergreen-terrace"

const body = renderHandoffBody({
  attempt: 2,
  baseRef: "main",
  baseSha: "a".repeat(40),
  completion: {
    aggregateDiff: {
      deletions: 1,
      filesChanged: 3,
      insertions: 9,
      path: `${home}/aggregate.diff`,
      sha256: "e".repeat(64)
    },
    artifactDirectory: `${home}/artifacts`,
    branch: "feature/et-goal/integration-a2",
    conflict: null,
    detail: "",
    headSha: "b".repeat(40),
    mergeOrder: [worker.b, worker.a],
    overlaps: [{ path: "src/shared.ts", workerIds: [worker.a, worker.b] }],
    resolutions: [],
    scopeViolations: [],
    selection: null,
    sources: [
      {
        branch: "feature/et-goal/api",
        captureCommitSha: "c".repeat(40),
        changedFiles: ["src/api.ts", "src/shared.ts"],
        commitSha: "c".repeat(40),
        deletions: 1,
        insertions: 5,
        role: "api",
        workerId: worker.a
      },
      {
        branch: "feature/et-goal/schema",
        captureCommitSha: null,
        changedFiles: ["src/schema.ts", "src/shared.ts"],
        commitSha: "d".repeat(40),
        deletions: 0,
        insertions: 4,
        role: "schema",
        workerId: worker.b
      }
    ],
    status: "validated",
    validationId: crypto.randomUUID(),
    worktreePath: `${home}/worktrees/integration`
  },
  goal: { id: crypto.randomUUID(), title: "Add the billing export" },
  integrationId: crypto.randomUUID(),
  validation: {
    artifactDirectory: `${home}/validation`,
    commitSha: "b".repeat(40),
    completedAt: "2026-10-25T12:01:00.000Z",
    goalId: crypto.randomUUID(),
    idempotencyKey: "v",
    projectId: "github.com/example/repository",
    results: [
      {
        command: "bun install --frozen-lockfile",
        durationMs: 2_300,
        exitCode: 0,
        phase: "setup",
        stderrPath: `${home}/01.stderr.log`,
        stdoutPath: `${home}/01.stdout.log`,
        timedOut: false
      },
      {
        command: "bun run test | tee out",
        durationMs: 9_100,
        exitCode: 0,
        phase: "check",
        stderrPath: `${home}/02.stderr.log`,
        stdoutPath: `${home}/02.stdout.log`,
        timedOut: false
      }
    ],
    startedAt: "2026-10-25T12:00:00.000Z",
    status: "passed",
    subject: { id: crypto.randomUUID(), type: "integration" }
  }
})

test("renders sources in merge order with capture provenance and overlaps by role", () => {
  expect(body.indexOf("| 1 | schema |")).toBeGreaterThan(0)
  expect(body.indexOf("| 2 | api |")).toBeGreaterThan(body.indexOf("| 1 | schema |"))
  expect(body).toContain("(captured `cccccccccccc`)")
  expect(body).toContain("- `src/shared.ts`: api, schema")
  expect(body).toContain("### Validation: passed on `bbbbbbbbbbbb`")
  expect(body).toContain("sha256 `" + "e".repeat(64) + "`")
})

test("never discloses local filesystem paths and escapes table-breaking characters", () => {
  expect(body).not.toContain("/home/")
  expect(body).not.toContain(".local/state")
  expect(body).toContain("bun run test \\| tee out")
})

test("supersede comments carry a recovery marker", () => {
  const id = crypto.randomUUID()
  expect(renderSupersedeComment(id, "https://github.com/example/repository/pull/9")).toStartWith(supersedeMarker(id))
})

test("discloses integrator resolutions and exclusions to reviewers, with rationale", async () => {
  const { renderHandoffBody: render } = await import("./handoff-body")
  const integrator = crypto.randomUUID()
  const excluded = crypto.randomUUID()
  const resolved = render({
    attempt: 2,
    baseRef: "main",
    baseSha: "a".repeat(40),
    completion: {
      aggregateDiff: null,
      artifactDirectory: "/x",
      branch: "feature/et-goal/integration-a2",
      conflict: null,
      scopeViolations: [],
      detail: "",
      headSha: "b".repeat(40),
      mergeOrder: [worker.a],
      overlaps: [],
      resolutions: [
        {
          conflictedWorkerId: worker.a,
          integratorWorkerId: integrator,
          paths: ["README.md"],
          rationale: "Kept both lines.\nOwner first, then status.",
          rationaleSha256: "f".repeat(64),
          resolvedCommitSha: "9".repeat(40)
        }
      ],
      selection: { excludedWorkerIds: [excluded], rationale: "Superseded approach." },
      sources: [
        {
          branch: "b",
          captureCommitSha: null,
          changedFiles: ["README.md"],
          commitSha: "c".repeat(40),
          deletions: 0,
          insertions: 1,
          role: "status",
          workerId: worker.a
        }
      ],
      status: "validated",
      validationId: crypto.randomUUID(),
      worktreePath: "/x/wt"
    },
    goal: { id: crypto.randomUUID(), title: "Goal" },
    integrationId: crypto.randomUUID(),
    validation: {
      artifactDirectory: "/x/v",
      commitSha: "b".repeat(40),
      completedAt: "2026-10-26T00:00:00.000Z",
      goalId: crypto.randomUUID(),
      idempotencyKey: "v",
      projectId: "github.com/example/repository",
      results: [
        {
          command: "true",
          durationMs: 1,
          exitCode: 0,
          phase: "check",
          stderrPath: "/x/e",
          stdoutPath: "/x/o",
          timedOut: false
        }
      ],
      startedAt: "2026-10-26T00:00:00.000Z",
      status: "passed",
      subject: { id: crypto.randomUUID(), type: "integration" }
    }
  })
  expect(resolved).toContain("### Conflicts resolved by the integrator agent")
  expect(resolved).toContain("**status** conflicted on `README.md`; resolved in `999999999999`")
  expect(resolved).toContain("> Kept both lines.\n> Owner first, then status.")
  expect(resolved).toContain("### Excluded worker output")
  expect(resolved).toContain("> Superseded approach.")
})
