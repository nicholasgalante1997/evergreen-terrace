/** @module Browser-side calls to the console's own same-origin API. */

import type { ConsoleSnapshot } from "../read-model/read-model.types"

export const fetchSnapshot = async (): Promise<ConsoleSnapshot> => {
  const response = await fetch("/api/snapshot")
  if (!response.ok) {
    throw new Error(`Snapshot failed: ${response.status}`)
  }
  return (await response.json()) as ConsoleSnapshot
}

const post = async (path: string, body: unknown): Promise<unknown> => {
  const response = await fetch(path, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-evergreen-console": "1" },
    method: "POST"
  })
  const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; result?: unknown } | null
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `${path} failed: ${response.status}`)
  }
  return payload?.result
}

export interface JarvisAnswer {
  answer: string
  claims: Array<{ confidence: string; sources: Array<{ id: string; kind: string }>; statement: string }>
  missingEvidence: string[]
  proposedActions: Array<{ arguments: Record<string, unknown>; consequence: string; label: string; tool: string }>
}

export type JarvisOutcome =
  | { answer: JarvisAnswer; questionId: string; status: "answered" }
  | { detail: string; questionId: string; status: "failed" }

export const askJarvis = async (question: string, goalId: string | null): Promise<JarvisOutcome> =>
  (await post("/api/jarvis", { goalId, question })) as JarvisOutcome

export const invokeAction = (tool: string, argumentsValue: Record<string, unknown>): Promise<unknown> =>
  post("/api/actions", { arguments: argumentsValue, tool })

export const resolveDecision = async (
  decisionId: string,
  resolution: { note: string; selectedOptionId: string | null; status: "approved" | "rejected" }
): Promise<void> => {
  const response = await fetch(`/api/decisions/${decisionId}/resolve`, {
    body: JSON.stringify(resolution),
    headers: { "content-type": "application/json", "x-evergreen-console": "1" },
    method: "POST"
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(payload?.error?.message ?? `Resolution failed: ${response.status}`)
  }
}
