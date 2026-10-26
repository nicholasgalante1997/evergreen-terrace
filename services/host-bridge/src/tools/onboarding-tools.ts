/** @module Governed repository-onboarding MCP tools. */

import { workerAdapterSchema } from "@evergreen-terrace/contracts"
import type { McpTool } from "@evergreen-terrace/mcp-core"
import { z } from "zod"
import type { CommandApiClient } from "../command-api/command-api-client"
import type { OnboardingService } from "../onboarding/onboarding-service"
import { normalizeRemote } from "../workspace/remote-identity"
import { runProcess } from "../process/run-process"
import { toolResult } from "./tool-result"

const discoverSchema = z
  .object({
    adapter: workerAdapterSchema.default("claude"),
    baseRef: z.string().min(1).max(256).optional(),
    feedback: z.string().max(8_000).optional(),
    idempotencyKey: z.string().min(1).max(128).optional(),
    remote: z
      .string()
      .regex(/^[A-Za-z0-9._-]+$/)
      .default("origin"),
    wait: z.boolean().default(false),
    workers: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3)
  })
  .strict()

const applySchema = z.object({ onboardingId: z.string().uuid(), validate: z.boolean().default(true) }).strict()
const statusSchema = z
  .object({
    remote: z
      .string()
      .regex(/^[A-Za-z0-9._-]+$/)
      .default("origin")
  })
  .strict()

export class OnboardingDiscoverTool implements McpTool {
  readonly definition = {
    description:
      "Onboard this repository: two to four read-only discovery agents and the mayor study its base commit and cite their evidence; the factory composes the proposed .et/config.toml and records one onboarding decision card for the whole packet. Nothing is fetched or written. Running it again after a revision request picks up the engineer's note. Returns immediately unless wait is true.",
    inputSchema: z.toJSONSchema(discoverSchema, { io: "input" }),
    name: "evergreen.onboarding.discover"
  }

  constructor(private readonly onboarding: OnboardingService) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const input = discoverSchema.parse(argumentsValue)
    const started = await this.onboarding.discover({
      adapter: input.adapter,
      ...(input.baseRef === undefined ? {} : { baseRef: input.baseRef }),
      ...(input.feedback === undefined ? {} : { feedback: input.feedback }),
      ...(input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey }),
      remote: input.remote,
      workers: input.workers
    })
    const { completion, ...summary } = started
    return toolResult(input.wait ? { ...summary, result: await completion } : { ...summary, status: "discovering" })
  }
}

export class OnboardingApplyTool implements McpTool {
  readonly definition = {
    description:
      "Apply an approved onboarding packet: commit exactly the approved .et/config.toml on a new factory branch in a factory worktree, then run its validation there. Refused until the onboarding card is resolved. It never touches the active checkout or a protected branch and never pushes; merging the branch is the engineer's action.",
    inputSchema: z.toJSONSchema(applySchema, { io: "input" }),
    name: "evergreen.onboarding.apply"
  }

  constructor(private readonly onboarding: OnboardingService) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    return toolResult(await this.onboarding.apply(applySchema.parse(argumentsValue)))
  }
}

export class OnboardingStatusTool implements McpTool {
  readonly definition = {
    description:
      "List this repository's onboarding attempts with their status, full approval packet (facts, cited discovery reports, proposed policy text), decision card ID, and applied result.",
    inputSchema: z.toJSONSchema(statusSchema, { io: "input" }),
    name: "evergreen.onboarding.status"
  }

  constructor(
    private readonly commandApi: CommandApiClient,
    private readonly projectRoot: string
  ) {}

  async invoke(argumentsValue: unknown): Promise<ReturnType<typeof toolResult>> {
    const { remote } = statusSchema.parse(argumentsValue)
    const url = (await runProcess(["git", "remote", "get-url", remote], this.projectRoot)).stdout.trim()
    const projectId = await normalizeRemote(url)
    if (projectId === null) {
      throw new Error(`Remote ${remote} is not a host/owner/repository remote`)
    }
    return toolResult({ onboardings: await this.commandApi.listProjectOnboardings(projectId), projectId })
  }
}
