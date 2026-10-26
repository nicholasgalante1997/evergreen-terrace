/** @module Worktree-scoped ACP permission resolver: conservative automatic approval, else a decision card. */

import type { AcpPermissionResolution, AcpPermissionResolver } from "./acp-runner.types"
import { allowOncePermissionResponse, automaticApprovalRule } from "./worktree-permission-policy"
import type { AutomaticApprovalPolicy } from "./worktree-permission-policy.types"

export class WorktreePermissionResolver implements AcpPermissionResolver {
  constructor(
    private readonly worktreePath: string,
    private readonly policy: AutomaticApprovalPolicy,
    private readonly decisions: AcpPermissionResolver
  ) {}

  async resolve(params: unknown): Promise<AcpPermissionResolution> {
    const rule = automaticApprovalRule(params, this.worktreePath, this.policy)
    const response = rule === null ? undefined : allowOncePermissionResponse(params)
    return rule !== null && response !== undefined ? { granted: true, response, rule, via: "automatic" } : this.decisions.resolve(params)
  }
}
