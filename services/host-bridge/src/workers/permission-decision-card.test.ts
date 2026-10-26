/** @module ACP permission description and decision-card tests, using real ACP v1 request shapes. */

import { expect, test } from "bun:test"
import { acpPermissionRequestSummary, describeAcpPermission } from "./acp-permission"
import { permissionDecisionCard } from "./permission-decision-card"

const worktree = "/home/engineer/.local/state/evergreen-terrace/worktrees/p/g/api/attempt-1"
const options = [
  { kind: "allow_once", name: "Allow", optionId: "allow" },
  { kind: "allow_always", name: "Always", optionId: "always" },
  { kind: "reject_once", name: "Reject", optionId: "reject" }
]

/** Shape observed from claude-agent-acp during the live Compose exercise. */
const writeRequest = {
  options,
  sessionId: "s-1",
  toolCall: {
    kind: "edit",
    locations: [{ path: `${worktree}/notes/api.md` }],
    rawInput: { content: "# API\n", file_path: `${worktree}/notes/api.md` },
    title: "Write notes/api.md",
    toolCallId: "t-1"
  }
}

const card = (request: unknown) =>
  permissionDecisionCard({
    allowOnceOptionIds: ["allow-once-1"],
    description: describeAcpPermission(request, worktree),
    goalId: crypto.randomUUID(),
    projectId: "github.com/example/repository",
    requestNumber: 1,
    role: "api",
    workerId: "93c972b1-3f04-4689-a0cb-717aaf6d1eb2"
  })

test("a file write card names the action and worktree-relative file in its title and context", () => {
  const decision = card(writeRequest)
  expect(decision.title).toBe("api: edit notes/api.md")
  expect(decision.context).toContain("Action kind: edit")
  expect(decision.context).toContain("Agent title: Write notes/api.md")
  expect(decision.context).toContain("- notes/api.md")
  expect(decision.context).toContain("All reported locations are inside the worker's worktree.")
  expect(decision.context).not.toContain("# API")
})

test("a location outside the worktree is shown in full and flagged in title and context", () => {
  const decision = card({
    ...writeRequest,
    toolCall: { ...writeRequest.toolCall, locations: [{ path: "/home/engineer/.ssh/config" }], title: "Edit config" }
  })
  expect(decision.title).toBe("api: edit /home/engineer/.ssh/config OUTSIDE the worktree")
  expect(decision.context).toContain("/home/engineer/.ssh/config  <-- OUTSIDE the worker worktree")
  expect(decision.context).toContain("WARNING")
})

test("execute and fetch requests never copy the command line or URL", () => {
  const secret = "export GITHUB_TOKEN=ghp_supersecret && curl https://example.com/?token=abc"
  for (const kind of ["execute", "fetch"]) {
    const request = {
      options,
      sessionId: "s-1",
      toolCall: { kind, rawInput: { command: secret }, title: secret, toolCallId: "t-2" }
    }
    const decision = card(request)
    const summary = JSON.stringify(acpPermissionRequestSummary(request, worktree))
    expect(decision.title).toBe(kind === "execute" ? "api: execute (command withheld)" : "api: fetch (URL withheld)")
    for (const text of [decision.title, decision.context, summary]) {
      expect(text).not.toContain("ghp_supersecret")
      expect(text).not.toContain("token=abc")
    }
    expect(decision.context).toContain("withheld because it may contain credentials")
  }
})

test("an unrecognized request still produces an honest card", () => {
  const decision = card({ options, sessionId: "s-1", toolCall: { toolCallId: "t-3" } })
  expect(decision.title).toBe("api: unknown (no location given)")
  expect(decision.context).toContain("No file locations were reported")
})

test("the artifact summary carries the same safe description", () => {
  expect(acpPermissionRequestSummary(writeRequest, worktree)).toEqual(
    expect.objectContaining({
      kind: "edit",
      locations: [{ insideWorktree: true, path: "notes/api.md" }],
      optionKinds: ["allow_once", "allow_always", "reject_once"],
      outsideWorktree: false,
      title: "Write notes/api.md"
    })
  )
})
