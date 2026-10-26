/** @module Read-only ACP sessions: a read-only checkout mount plus a resolver that never grants writes. */

import { AcpWorkerRunner } from "../workers/acp-runner"
import { ReadOnlyPermissionResolver } from "./read-only-permission-resolver"
import type { ReadOnlyAgentPort, ReadOnlyAgentRun } from "./read-only-agent.types"

export class ReadOnlyAgentSessions implements ReadOnlyAgentPort {
  async run(input: ReadOnlyAgentRun): Promise<{ stopReason: string; turns: number }> {
    const runner = new AcpWorkerRunner(new ReadOnlyPermissionResolver(input.checkoutPath))
    const result = await runner.run({
      adapter: input.adapter,
      artifactDirectory: input.artifactDirectory,
      ...(input.continueWith === undefined ? {} : { continueWith: input.continueWith }),
      prompt: input.prompt,
      readOnly: true,
      workerId: input.label,
      worktreePath: input.checkoutPath
    })
    return { stopReason: result.stopReason, turns: result.turns }
  }
}
