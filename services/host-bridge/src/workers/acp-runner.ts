/** @module ACP session runner for isolated factory worktrees. */

import { appendFile, mkdir, writeFile } from "node:fs/promises"
import * as acp from "@agentclientprotocol/sdk"
import { adapterCommand } from "./adapter-command"
import { adapterRuntimeEnvironment } from "./adapter-runtime-environment"
import { acpPermissionRequestSummary, acpPermissionResponseSummary } from "./acp-permission"
import { planAuthEnvironment } from "./plan-auth-environment"
import { stdinWritableStream } from "./stdin-writable-stream"
import { workerSandboxCommand } from "./worker-sandbox"
import type { AcpPermissionResolver, AcpWorkerResult, AcpWorkerRun } from "./acp-runner.types"

export class AcpWorkerRunner {
  constructor(private readonly permissions: AcpPermissionResolver) {}

  async run(input: AcpWorkerRun): Promise<AcpWorkerResult> {
    await mkdir(input.artifactDirectory, { recursive: true })
    const eventLogPath = `${input.artifactDirectory}/acp.events.ndjson`
    const resultPath = `${input.artifactDirectory}/acp.result.json`
    const startedAt = new Date().toISOString()
    let sequence = 0
    let logChain = Promise.resolve()
    const record = (kind: string, payload: unknown): Promise<void> => {
      const event = { kind, payload, sequence: ++sequence, timestamp: new Date().toISOString(), workerId: input.workerId }
      logChain = logChain.then(() => appendFile(eventLogPath, `${JSON.stringify(event)}\n`))
      return logChain
    }

    const process = Bun.spawn(
      await workerSandboxCommand(input.adapter, adapterCommand(input.adapter), input.worktreePath, input.artifactDirectory),
      {
        env: {
          ...planAuthEnvironment(),
          ...adapterRuntimeEnvironment(input.adapter, input.artifactDirectory),
          APP_SERVER_LOGS: input.artifactDirectory,
          NO_BROWSER: "1",
          TEMP: "/tmp",
          TMP: "/tmp",
          TMPDIR: "/tmp"
        },
        stderr: "pipe",
        stdin: "pipe",
        stdout: "pipe"
      }
    )
    const stderrRecorded = new Response(process.stderr)
      .text()
      .then(async (stderr) => (stderr.length === 0 ? undefined : record("adapter.stderr", stderr)))
    const stream = acp.ndJsonStream(stdinWritableStream(process.stdin), process.stdout)
    const terminate = (): void => process.kill("SIGTERM")
    const aborted = new Promise<never>((_, reject) => {
      const abort = (): void => {
        terminate()
        reject(new Error(`ACP worker session aborted: ${String(input.signal?.reason ?? "aborted")}`))
      }
      if (input.signal?.aborted === true) {
        abort()
      }
      input.signal?.addEventListener("abort", abort, { once: true })
    })
    aborted.catch(() => undefined)
    try {
      const session = acp
        .client({ name: "evergreen-terrace" })
        .onRequest(acp.methods.client.session.requestPermission, async (context) => {
          await record("permission.requested", acpPermissionRequestSummary(context.params, input.worktreePath))
          const resolution = await this.permissions.resolve(context.params)
          await record("permission.resolved", {
            ...acpPermissionResponseSummary(resolution.response),
            ...(resolution.via === "automatic" ? { rule: resolution.rule } : { decisionId: resolution.decisionId }),
            granted: resolution.granted,
            via: resolution.via
          })
          return resolution.response as never
        })
        .onNotification(acp.methods.client.session.update, async (context) => {
          await record("session.update", context.params)
        })
        .connectWith(stream, async (context) => {
          const initialized = await context.request(acp.methods.agent.initialize, {
            clientCapabilities: {},
            protocolVersion: acp.PROTOCOL_VERSION
          })
          await record("agent.initialized", initialized)
          return context.buildSession(input.worktreePath).withSession(async (session) => {
            await record("session.created", { sessionId: session.sessionId })
            const promptResult = session.prompt(input.prompt)
            for (;;) {
              const message = await session.nextUpdate()
              if (message.kind === "stop") {
                await promptResult
                return { response: message.response, sessionId: session.sessionId }
              }
              await record("session.active_update", message.notification)
            }
          })
        })
      const result = await Promise.race([session, aborted])
      terminate()
      await stderrRecorded
      await logChain
      const completedAt = new Date().toISOString()
      const workerResult: AcpWorkerResult = {
        adapter: input.adapter,
        completedAt,
        eventLogPath,
        resultPath,
        sessionId: result.sessionId,
        startedAt,
        stopReason: result.response.stopReason,
        workerId: input.workerId
      }
      await writeFile(resultPath, `${JSON.stringify({ ok: true, result: workerResult }, null, 2)}\n`)
      return workerResult
    } catch (error) {
      terminate()
      await stderrRecorded
      await record("worker.failed", { message: error instanceof Error ? error.message : String(error) })
      await logChain
      await writeFile(
        resultPath,
        `${JSON.stringify({ error: error instanceof Error ? error.message : String(error), ok: false }, null, 2)}\n`
      )
      throw error
    } finally {
      terminate()
    }
  }
}
