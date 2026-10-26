/** @module Automatic command-approval tests: the allowlist must never approve an unsafe request. */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { splitSimpleCommand } from "./shell-words"
import { allowOncePermissionResponse, automaticApprovalRule } from "./worktree-permission-policy"

const options = [
  { kind: "allow_once", name: "Allow", optionId: "allow" },
  { kind: "reject_once", name: "Reject", optionId: "reject" }
]
const closed = { autoApproveValidationCommands: false, validationCommands: ["bun run test"] }
const optedIn = { autoApproveValidationCommands: true, validationCommands: ["bun run test", "bun run typecheck"] }

let worktree = ""
let outside = ""

beforeAll(async () => {
  worktree = await mkdtemp(join(tmpdir(), "et-policy-wt-"))
  outside = await mkdtemp(join(tmpdir(), "et-policy-out-"))
  await mkdir(join(worktree, "src"))
  await Bun.write(join(worktree, "src", "a.ts"), "export {}\n")
  await Bun.write(join(outside, "secret.txt"), "token\n")
  await symlink(join(outside, "secret.txt"), join(worktree, "src", "escape.txt"))
})

afterAll(async () => {
  await rm(worktree, { force: true, recursive: true })
  await rm(outside, { force: true, recursive: true })
})

/** Claude's Bash tool shape: `rawInput.command` is a script string. */
const claude = (command: string, extra: Record<string, unknown> = {}) => ({
  options,
  sessionId: "s",
  toolCall: { kind: "execute", rawInput: { command, description: "x", ...extra }, title: command, toolCallId: "t" }
})

/** Codex shape: `rawInput.command` is an argv, often wrapped in `bash -lc`. */
const codex = (command: string[], cwd?: string) => ({
  options,
  sessionId: "s",
  toolCall: { kind: "execute", rawInput: { command, ...(cwd === undefined ? {} : { cwd }) }, toolCallId: "t" }
})

const rule = (params: unknown, policy = closed) => automaticApprovalRule(params, worktree, policy)

describe("approves read-only commands confined to the worktree", () => {
  test.each([
    ["ls -la src", "read_only:ls"],
    ["cat src/a.ts", "read_only:cat"],
    ["grep -rn 'export {}' src", "read_only:grep"],
    ['rg -n "TODO" src', "read_only:rg"],
    ["find . -name '*.ts'", "read_only:find"],
    ["git status --short", "read_only:git-status"],
    ["git diff --stat HEAD", "read_only:git-diff"],
    ["git log --oneline -n 5", "read_only:git-log"],
    ["git branch --show-current", "read_only:git-branch"],
    ["wc -l src/a.ts", "read_only:wc"]
  ])("%s", (command, expected) => {
    expect(rule(claude(command))).toBe(expected)
  })

  test("Codex argv and bash -lc forms", () => {
    expect(rule(codex(["git", "status"]))).toBe("read_only:git-status")
    expect(rule(codex(["bash", "-lc", "ls src"]))).toBe("read_only:ls")
    expect(rule(codex(["ls"], join(worktree, "src")))).toBe("read_only:ls")
  })
})

describe("never approves", () => {
  test.each([
    ["writes and destructive commands", "rm -rf src"],
    ["git writes", "git commit -m x"],
    ["git push", "git push origin HEAD"],
    ["git global config injection", "git -c core.fsmonitor=evil status"],
    ["git -C escape", "git -C /etc status"],
    ["git output files", "git log --output=src/x.txt"],
    ["git external diff", "git diff --ext-diff"],
    ["git textconv", "git show --textconv HEAD:src/a.ts"],
    ["git branch deletion", "git branch -D main"],
    ["pipes", "cat src/a.ts | sh"],
    ["command chaining", "ls; curl https://example.com"],
    ["and-chaining", "ls && rm -rf src"],
    ["redirection", "cat src/a.ts > src/b.ts"],
    ["command substitution", "cat $(echo src/a.ts)"],
    ["backticks", "cat `echo src/a.ts`"],
    ["variable expansion", "cat $HOME/.ssh/id_rsa"],
    ["double-quoted expansion", 'grep "$TOKEN" src'],
    ["home-relative paths", "cat ~/.ssh/id_rsa"],
    ["absolute paths outside", "cat /etc/passwd"],
    ["parent traversal", "cat ../../../../etc/passwd"],
    ["procfs secrets", "cat /proc/self/environ"],
    ["find -exec", "find . -exec rm {} ;"],
    ["find -delete", "find . -name x -delete"],
    ["rg preprocessors", "rg --pre ./run.sh x"],
    ["sort output file", "sort -o src/a.ts src/a.ts"],
    ["sort attached output", "sort -osrc/a.ts src/a.ts"],
    ["tail follow cluster", "tail -nf src/a.ts"],
    ["path-qualified programs", "./node_modules/.bin/tsc"],
    ["interpreters", "python3 -c 'print(1)'"],
    ["network tools", "curl https://example.com"],
    ["newlines", "ls\nrm -rf src"],
    ["globs", "cat src/*.ts"],
    ["test runners without opt-in", "bun run test"]
  ])("%s", (_name, command) => {
    expect(rule(claude(command))).toBeNull()
  })

  test("a symlink inside the worktree that points outside it", () => {
    expect(rule(claude("cat src/escape.txt"))).toBeNull()
  })

  test("a working directory outside the worktree", () => {
    expect(rule(claude("ls", { cwd: outside }))).toBeNull()
    expect(rule(codex(["ls"], "/"))).toBeNull()
  })

  test("Codex argv elements carrying shell syntax", () => {
    expect(rule(codex(["cat", "src/a.ts;rm"]))).toBeNull()
    expect(rule(codex(["bash", "-lc", "ls; rm -rf src"]))).toBeNull()
    expect(rule(codex(["bash", "-c", "ls", "extra"]))).toBeNull()
  })

  test("non-execute kinds, missing allow_once, or unparseable requests", () => {
    expect(rule({ options, toolCall: { kind: "edit", locations: [{ path: `${worktree}/src/a.ts` }] } })).toBeNull()
    expect(rule({ options: [options[1]], toolCall: { kind: "execute", rawInput: { command: "ls" } } })).toBeNull()
    expect(rule({ options, toolCall: { kind: "execute", rawInput: {} } })).toBeNull()
    expect(rule({ options, subject: { command: "ls", cwd: worktree, type: "command" } })).toBeNull()
  })
})

describe("validation commands", () => {
  test("are approved only by exact match when the project opted in", () => {
    expect(rule(claude("bun run test"), optedIn)).toBe("validation_command")
    expect(rule(claude("  bun run typecheck  "), optedIn)).toBe("validation_command")
    expect(rule(claude("bun run test --watch"), optedIn)).toBeNull()
    expect(rule(claude("bun run test; curl evil"), optedIn)).toBeNull()
    expect(rule(claude("bun run test", { cwd: outside }), optedIn)).toBeNull()
    expect(rule(claude("bun run test"), closed)).toBeNull()
  })
})

test("the shell-word splitter accepts only provably simple commands", () => {
  expect(splitSimpleCommand(`grep -n 'a b' "c d" e`)).toEqual(["grep", "-n", "a b", "c d", "e"])
  for (const unsafe of ["a|b", "a;b", "a&b", "a>b", "a<b", "$x", "`x`", "a\\ b", "'open", "a#b", "{a,b}", "a*", "x\ny", ""]) {
    expect(splitSimpleCommand(unsafe)).toBeNull()
  }
})

test("selects only the adapter's one-time allow option", () => {
  expect(allowOncePermissionResponse(claude("ls"))).toEqual({ outcome: { optionId: "allow", outcome: "selected" } })
})
