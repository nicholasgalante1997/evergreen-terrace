/** @module Conservative automatic approval of ACP v1 command requests inside one worktree. */

import { realpathSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"
import { acpPermissionRequest } from "./acp-permission"
import { readOnlyRule } from "./command-allowlist"
import { splitSimpleCommand } from "./shell-words"
import type { AutomaticApprovalPolicy } from "./worktree-permission-policy.types"

const recordValue = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

const shells = new Set(["bash", "sh", "zsh"])
const plainWord = /^[A-Za-z0-9_./:=@%+,-]+$/

/**
 * The command an `execute` request will run, as either a shell script string
 * or an exact argv. Claude sends `rawInput.command` as a string; Codex may send
 * an argv array, often `["bash", "-lc", script]`.
 */
const requestedCommand = (rawInput: Record<string, unknown> | undefined): { argv: string[] } | { script: string } | null => {
  const command = rawInput?.command
  if (typeof command === "string") {
    return { script: command }
  }
  if (Array.isArray(command) && command.length > 0 && command.every((word): word is string => typeof word === "string")) {
    const [program, flag, script, ...extra] = command
    if (program !== undefined && shells.has(program) && (flag === "-c" || flag === "-lc") && script !== undefined && extra.length === 0) {
      return { script }
    }
    return { argv: command }
  }
  return null
}

const cwdInsideWorktree = (worktreePath: string, cwd: unknown): boolean => {
  if (cwd === undefined || cwd === null) {
    return true
  }
  if (typeof cwd !== "string") {
    return false
  }
  try {
    const inside = relative(realpathSync(resolve(worktreePath)), realpathSync(resolve(worktreePath, cwd)))
    return inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))
  } catch {
    return false
  }
}

/**
 * Returns the approving rule, or null to send the request to an engineer.
 *
 * Only `execute` requests offering `allow_once` qualify, with a working directory
 * inside the worktree. A command is approved when it:
 * - exactly equals a `.et` validation check command and the project opted in
 *   (`permissions.auto_approve_validation_commands`); or
 * - is one simple command (no shell operators or expansions) on the read-only
 *   allowlist with every path argument confined to the worktree.
 */
export const automaticApprovalRule = (params: unknown, worktreePath: string, policy: AutomaticApprovalPolicy): string | null => {
  const request = acpPermissionRequest(params)
  if (request.toolCall.kind !== "execute" || !request.options.some((option) => option.kind === "allow_once")) {
    return null
  }
  const rawInput = recordValue(recordValue(recordValue(params)?.toolCall)?.rawInput)
  if (!cwdInsideWorktree(worktreePath, rawInput?.cwd)) {
    return null
  }
  const command = requestedCommand(rawInput)
  if (command === null) {
    return null
  }
  if ("script" in command && policy.autoApproveValidationCommands && policy.validationCommands.includes(command.script.trim())) {
    return "validation_command"
  }
  // An argv may still be handed to a shell by the adapter, so each element must be plain text.
  const argv =
    "script" in command
      ? splitSimpleCommand(command.script)
      : command.argv.every((word) => plainWord.test(word))
        ? command.argv
        : null
  return argv === null ? null : readOnlyRule(argv, worktreePath)
}

export const allowOncePermissionResponse = (params: unknown): unknown | undefined => {
  const option = acpPermissionRequest(params).options.find((candidate) => candidate.kind === "allow_once")
  return option === undefined ? undefined : { outcome: { optionId: option.optionId, outcome: "selected" } }
}
