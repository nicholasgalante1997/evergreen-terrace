/** @module ACP adapter command resolution. */

import type { AcpAdapter } from "./acp-runner.types"

export const adapterCommand = (adapter: AcpAdapter): string => {
  if (adapter === "claude") {
    return process.env["ET_CLAUDE_ACP_PATH"] ?? "claude-agent-acp"
  }
  return process.env["ET_CODEX_ACP_PATH"] ?? "codex-acp"
}
