/** @module Permission resolver for mayor and discovery sessions: read-only requests pass, everything else is refused. */

import { realpathSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"
import { acpPermissionRequest } from "../workers/acp-permission"
import type { AcpPermissionResolution, AcpPermissionResolver } from "../workers/acp-runner.types"
import { allowOncePermissionResponse, automaticApprovalRule } from "../workers/worktree-permission-policy"

const readKinds = new Set(["read", "search"])

const inside = (root: string, path: string): boolean => {
  try {
    const within = relative(realpathSync(root), realpathSync(isAbsolute(path) ? path : resolve(root, path)))
    return within === "" || (!within.startsWith("..") && !isAbsolute(within))
  } catch {
    return false
  }
}

/**
 * Never asks the engineer: a planning session has no business needing a card.
 * It may read files and run the same confined read-only commands a worker may
 * run unattended. Edits, fetches, other commands, and anything outside the
 * checkout are rejected, so the agent sees the refusal and carries on reading.
 */
export class ReadOnlyPermissionResolver implements AcpPermissionResolver {
  constructor(private readonly checkoutPath: string) {}

  async resolve(params: unknown): Promise<AcpPermissionResolution> {
    const request = acpPermissionRequest(params)
    const allow = allowOncePermissionResponse(params)
    const { kind, locations } = request.toolCall
    const rule =
      kind === "execute"
        ? automaticApprovalRule(params, this.checkoutPath, {
            autoApproveValidationCommands: false,
            validationCommands: []
          })
        : kind !== null &&
            readKinds.has(kind) &&
            locations.length > 0 &&
            locations.every((path) => inside(this.checkoutPath, path))
          ? `read_only:${kind}`
          : null
    if (rule !== null && allow !== undefined) {
      return { granted: true, response: allow, rule, via: "automatic" }
    }
    const reject = request.options.find((option) => option.kind === "reject_once")
    return {
      granted: false,
      response:
        reject === undefined
          ? { outcome: { outcome: "cancelled" } }
          : { outcome: { optionId: reject.optionId, outcome: "selected" } },
      rule: "read_only_session",
      via: "policy"
    }
  }
}
