/** @module Jarvis MCP tool: a cited, read-only answer about factory state. */

import { workerAdapterSchema } from "@evergreen-terrace/contracts"
import type { McpTool } from "@evergreen-terrace/mcp-core"
import { z } from "zod"
import type { JarvisService } from "../jarvis/jarvis-service"
import { toolResult } from "./tool-result"

const inputSchema = z
  .object({
    adapter: workerAdapterSchema.optional(),
    goalId: z.string().uuid().nullable().default(null),
    question: z.string().min(1).max(4_000)
  })
  .strict()

export class JarvisAskTool implements McpTool {
  readonly definition = {
    description:
      "Ask Jarvis, the read-only technical console agent, about factory state. It reads only a host-written snapshot of the read model (optionally scoped to one goal), cites a record for every claim, lists missing evidence, and may propose governed actions. It performs no action itself; a proposal runs only when the engineer invokes that tool.",
    inputSchema: z.toJSONSchema(inputSchema, { io: "input" }),
    name: "evergreen.jarvis.ask"
  }

  constructor(private readonly jarvis: JarvisService) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const input = inputSchema.parse(argumentsValue)
    return toolResult(
      await this.jarvis.ask({
        ...(input.adapter === undefined ? {} : { adapter: input.adapter }),
        goalId: input.goalId,
        question: input.question
      })
    )
  }
}
