/** @module Jarvis: answers questions about factory state from durable evidence, read-only, with cited claims. */

import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { WorkerAdapter } from "@evergreen-terrace/contracts"
import type { ReadOnlyAgentPort } from "../planning/read-only-agent.types"
import { runStructuredSession } from "../planning/structured-output"
import { answerIssues, jarvisAnswerSchema, proposableTools, proposalIssues } from "./jarvis-answer"
import { jarvisPrompt } from "./jarvis-brief"
import type { JarvisAnswer } from "./jarvis-answer"
import { writeEvidence } from "./jarvis-evidence"

export interface JarvisServicePorts {
  agent: ReadOnlyAgentPort
  /** The adapter Jarvis uses when a question does not name one; configured separately from workers. */
  defaultAdapter: WorkerAdapter
  fetcher?: typeof fetch
  jarvisRoot: string
  preferences(): Promise<Array<{ key: string; value: string }>>
  readApiUrl: string
  /** Input schemas of the bridge's registered tools, by name. */
  toolSchemas(): Record<string, unknown>
}

export type JarvisOutcome =
  | { answer: JarvisAnswer; evidenceDirectory: string; questionId: string; status: "answered" }
  | { detail: string; evidenceDirectory: string; questionId: string; status: "failed" }

/**
 * Each question gets a fresh evidence directory written from the read model,
 * a read-only session over exactly that directory, and an answer whose every
 * citation the host has checked. Question, evidence, answer, and transcript
 * are kept under `jarvis/<question-id>/`. Jarvis performs no action.
 */
export class JarvisService {
  constructor(private readonly ports: JarvisServicePorts) {}

  async ask(input: { adapter?: WorkerAdapter; goalId: string | null; question: string }): Promise<JarvisOutcome> {
    const questionId = crypto.randomUUID()
    const root = join(this.ports.jarvisRoot, questionId)
    const evidenceDirectory = join(root, "evidence")
    const evidence = await writeEvidence({
      directory: evidenceDirectory,
      goalId: input.goalId,
      readApiUrl: this.ports.readApiUrl,
      ...(this.ports.fetcher === undefined ? {} : { fetcher: this.ports.fetcher })
    })
    await writeFile(
      join(root, "question.json"),
      `${JSON.stringify({ ...input, askedAt: new Date().toISOString() }, null, 2)}\n`
    )
    const all = this.ports.toolSchemas()
    const toolSchemas = Object.fromEntries(proposableTools.filter((name) => name in all).map((name) => [name, all[name]]))
    const outcome = await runStructuredSession(
      this.ports.agent,
      {
        adapter: input.adapter ?? this.ports.defaultAdapter,
        artifactDirectory: join(root, "session"),
        checkoutPath: evidenceDirectory,
        label: `jarvis:${questionId}`,
        prompt: jarvisPrompt({
          evidence,
          goalId: input.goalId,
          preferences: await this.ports.preferences(),
          question: input.question,
          toolSchemas
        })
      },
      jarvisAnswerSchema,
      (answer) => [...answerIssues(answer, evidence.known), ...proposalIssues(answer, toolSchemas)]
    )
    const result: JarvisOutcome = outcome.ok
      ? { answer: outcome.value, evidenceDirectory, questionId, status: "answered" }
      : { detail: outcome.detail, evidenceDirectory, questionId, status: "failed" }
    await writeFile(join(root, "answer.json"), `${JSON.stringify(result, null, 2)}\n`)
    return result
  }
}
