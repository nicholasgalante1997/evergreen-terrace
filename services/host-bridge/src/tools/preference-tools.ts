/** @module Governed learned-preference MCP tools. */

import { preferenceCategorySchema, preferenceKeySchema } from "@evergreen-terrace/contracts"
import type { McpTool } from "@evergreen-terrace/mcp-core"
import { loadProjectPolicy } from "@evergreen-terrace/project-policy"
import { z } from "zod"
import type { CommandApiClient } from "../command-api/command-api-client"
import { toolResult } from "./tool-result"

const proposeSchema = z
  .object({
    category: preferenceCategorySchema,
    evidence: z.array(z.string().min(1).max(2_048)).min(1).max(8),
    idempotencyKey: z.string().min(1).max(128).optional(),
    key: preferenceKeySchema,
    rationale: z.string().min(1).max(4_000),
    scope: z.enum(["global", "project"]),
    value: z.string().min(1).max(2_000)
  })
  .strict()

const listSchema = z.object({ includeHistory: z.boolean().default(false) }).strict()

export class PreferenceProposeTool implements McpTool {
  readonly definition = {
    description:
      "Propose a learned preference (tone, verbosity, runner, workflow, or a language/framework convention) for the global profile or this project. A low-impact preference with at least two distinct pieces of evidence that changes nothing already learned is promoted at once; everything else becomes a preference decision card. Policy can never be learned: it changes only through .et on a factory branch.",
    inputSchema: z.toJSONSchema(proposeSchema, { io: "input" }),
    name: "evergreen.preference.propose"
  }

  constructor(
    private readonly commandApi: CommandApiClient,
    private readonly projectRoot: string
  ) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const input = proposeSchema.parse(argumentsValue)
    const projectId = input.scope === "project" ? (await loadProjectPolicy(this.projectRoot)).project_id : null
    return toolResult(
      await this.commandApi.proposePreference({
        category: input.category,
        evidence: input.evidence,
        idempotencyKey: input.idempotencyKey ?? `preference-${crypto.randomUUID()}`,
        key: input.key,
        projectId,
        rationale: input.rationale,
        scope: input.scope,
        value: input.value
      })
    )
  }
}

export class PreferenceListTool implements McpTool {
  readonly definition = {
    description:
      "List the learned preferences in effect for this project (global plus project-specific). With includeHistory, also list proposed, rejected, and superseded ones.",
    inputSchema: z.toJSONSchema(listSchema, { io: "input" }),
    name: "evergreen.preference.list"
  }

  constructor(
    private readonly commandApi: CommandApiClient,
    private readonly projectRoot: string
  ) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const { includeHistory } = listSchema.parse(argumentsValue)
    const projectId = (await loadProjectPolicy(this.projectRoot)).project_id
    return toolResult({ preferences: await this.commandApi.listPreferences(projectId, !includeHistory), projectId })
  }
}
