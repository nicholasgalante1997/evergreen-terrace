/** @module Native host bridge composition root for MCP transports and capabilities. */

import { hostname } from "node:os"
import { isAbsolute, join } from "node:path"
import { loadProjectPolicy } from "@evergreen-terrace/project-policy"
import { CommandApiClient } from "./command-api/command-api-client"
import { GitHubCli } from "./github/github-cli"
import { HandoffService } from "./handoff/handoff-service"
import { IntegrationTrain } from "./integration/integration-train"
import { HandoffExecuteTool, HandoffRequestTool, HandoffStatusTool } from "./tools/handoff-tools"
import { ConflictIntegrator } from "./integration/conflict-integrator"
import { IntegrationResolveTool, IntegrationRunTool } from "./tools/integration-run-tool"
import { IntegrationStatusTool } from "./tools/integration-status-tool"
import { ValidationRunTool } from "./tools/validation-run-tool"
import { ValidationRunner } from "./validation/validation-runner"
import { ValidationService } from "./validation/validation-service"
import { DecisionRequestTool } from "./tools/decision-request-tool"
import { DecisionResolveTool } from "./tools/decision-resolve-tool"
import { GoalSubmitTool } from "./tools/goal-submit-tool"
import { ScheduleResumeTool } from "./tools/schedule-resume-tool"
import { ScheduleStatusTool } from "./tools/schedule-status-tool"
import { WorkspaceStatusTool } from "./tools/workspace-status-tool"
import { WorkspaceSyncTool } from "./tools/workspace-sync-tool"
import { WorkerPrepareTool } from "./tools/worker-prepare-tool"
import { WorkerPoolRunTool } from "./tools/worker-pool-run-tool"
import { WorkerRunTool } from "./tools/worker-run-tool"
import { WorktreePrepareTool } from "./tools/worktree-prepare-tool"
import { McpHttpServer } from "./transports/http-server"
import { serveStdio } from "./transports/stdio-transport"
import { GitWorkspace } from "./workspace/git-workspace"
import { defaultFactoryRoot } from "./worktrees/factory-root"
import { FactoryWorktreeManager } from "./worktrees/factory-worktree-manager"
import { WorkerExecutionService } from "./workers/worker-execution-service"
import { WorkerScheduler } from "./workers/worker-scheduler"
import { McpServer, McpToolRegistry } from "@evergreen-terrace/mcp-core"
import { readPort } from "@evergreen-terrace/service-runtime"

const argumentValue = (name: string): string | undefined =>
  process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1)

/** Bun auto-loads `.env`, where an optional setting is often present but empty; treat that as unset. */
const setting = (name: string): string | undefined => {
  const value = process.env[name]?.trim()
  return value === undefined || value.length === 0 ? undefined : value
}

const transport = argumentValue("--transport") ?? "stdio"
const projectRoot = argumentValue("--project-root") ?? process.cwd()
const factoryRoot = setting("ET_FACTORY_ROOT") ?? defaultFactoryRoot()
if (!isAbsolute(factoryRoot)) {
  throw new Error(`ET_FACTORY_ROOT must be an absolute path: ${factoryRoot}`)
}
const workspace = new GitWorkspace(projectRoot)
const worktrees = new FactoryWorktreeManager(factoryRoot, projectRoot)
const commandApi = new CommandApiClient(setting("ET_COMMAND_API_URL") ?? "http://127.0.0.1:7410")
const workerExecution = new WorkerExecutionService(commandApi, () => loadProjectPolicy(projectRoot))
const scheduler = new WorkerScheduler(commandApi, workerExecution, {
  leaseTtlSeconds: Number(setting("ET_WORKER_LEASE_TTL_SECONDS") ?? 90),
  schedulerId: `host-bridge:${hostname()}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`
})
for (const event of ["schedule:failed", "lease:lost", "lease:reconciled", "lease:release_failed", "lease:reconcile_failed"]) {
  scheduler.on(event, (detail: { error?: unknown; workerId?: string; goalId?: string }) =>
    console.error(
      JSON.stringify({
        error: detail.error instanceof Error ? detail.error.message : undefined,
        event: `scheduler.${event}`,
        goalId: detail.goalId,
        workerId: detail.workerId
      })
    )
  )
}
const validation = new ValidationService(commandApi, new ValidationRunner(join(factoryRoot, "cache")), () =>
  loadProjectPolicy(projectRoot)
)
const integrationTrain = new IntegrationTrain({
  commandApi,
  integrator: new ConflictIntegrator({ commandApi, scheduler }),
  validation,
  worktrees
})
const handoffs = new HandoffService({
  commandApi,
  github: new GitHubCli(projectRoot),
  loadPolicy: () => loadProjectPolicy(projectRoot),
  workDirectory: join(factoryRoot, "handoffs")
})
const tools = new McpToolRegistry()
  .register(new WorkspaceStatusTool(workspace))
  .register(new GoalSubmitTool(commandApi, workspace))
  .register(new DecisionRequestTool(commandApi))
  .register(new DecisionResolveTool(commandApi))
  .register(new WorkspaceSyncTool(workspace))
  .register(new WorktreePrepareTool(worktrees))
  .register(new WorkerPrepareTool(worktrees, commandApi))
  .register(new WorkerRunTool(commandApi, scheduler))
  .register(new WorkerPoolRunTool(scheduler))
  .register(new ScheduleStatusTool(commandApi, scheduler))
  .register(new ScheduleResumeTool(scheduler))
  .register(new ValidationRunTool(commandApi, validation))
  .register(new IntegrationRunTool(integrationTrain))
  .register(new IntegrationResolveTool(integrationTrain))
  .register(new IntegrationStatusTool(commandApi))
  .register(new HandoffRequestTool(handoffs))
  .register(new HandoffExecuteTool(handoffs))
  .register(new HandoffStatusTool(commandApi))
const mcp = new McpServer({
  instructions:
    "Evergreen Terrace is a governed local engineering factory. Inspect policy and workspace state before submitting a goal. Never treat a tool as permission to bypass policy.",
  serverInfo: { name: "evergreen-terrace", version: "0.1.0" },
  tools
})

if (transport === "stdio") {
  console.error(JSON.stringify({ event: "host_bridge.stdio_started", projectRoot }))
  await serveStdio(mcp)
} else if (transport === "http") {
  const server = new McpHttpServer({ mcp, port: readPort(process.env["PORT"], 7450) })
  server.start()
  console.error(JSON.stringify({ event: "host_bridge.http_started", port: server.port, projectRoot }))
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => server.stop())
  }
} else {
  throw new Error(`Unsupported host bridge transport: ${transport}`)
}
