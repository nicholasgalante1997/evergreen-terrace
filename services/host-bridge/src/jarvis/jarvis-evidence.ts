/** @module The evidence directory Jarvis reads: read-model records written by the host, nothing else. */

import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { evidenceKinds } from "./jarvis-answer"

type EvidenceKind = (typeof evidenceKinds)[number]

interface EvidenceSource {
  file: string
  idOf: (record: Record<string, unknown>) => string | undefined
  kind: EvidenceKind
  path: string
  /** Keeps only records about the goal in question, when one is given. */
  goalOf?: (record: Record<string, unknown>) => string | undefined
}

const field = (name: string) => (record: Record<string, unknown>) =>
  typeof record[name] === "string" ? (record[name] as string) : undefined

const sources: EvidenceSource[] = [
  { file: "goals.json", goalOf: field("id"), idOf: field("id"), kind: "goal", path: "/v1/goals" },
  { file: "plans.json", goalOf: field("goalId"), idOf: field("id"), kind: "plan", path: "/v1/plans" },
  { file: "workers.json", goalOf: field("goal_id"), idOf: field("id"), kind: "worker", path: "/v1/workers" },
  { file: "decisions.json", goalOf: field("goal_id"), idOf: field("id"), kind: "decision", path: "/v1/decisions" },
  {
    file: "integrations.json",
    goalOf: field("goal_id"),
    idOf: field("id"),
    kind: "integration",
    path: "/v1/integrations"
  },
  { file: "validations.json", goalOf: field("goalId"), idOf: field("id"), kind: "validation", path: "/v1/validations" },
  { file: "handoffs.json", goalOf: field("goal_id"), idOf: field("id"), kind: "handoff", path: "/v1/handoffs" },
  { file: "onboardings.json", idOf: field("id"), kind: "onboarding", path: "/v1/onboardings" },
  { file: "events.json", idOf: field("eventId"), kind: "event", path: "/v1/events?limit=200" }
]

const listKey: Record<EvidenceKind, string> = {
  decision: "decisions",
  event: "events",
  goal: "goals",
  handoff: "handoffs",
  integration: "integrations",
  onboarding: "onboardings",
  plan: "plans",
  validation: "validations",
  worker: "workers"
}

export interface EvidenceDirectory {
  /** Record IDs per kind, for checking citations. */
  known: Map<string, Set<string>>
  manifest: Array<{ count: number; file: string; kind: EvidenceKind }>
  path: string
}

/**
 * Snapshots the read model into one JSON file per record kind. When a goal is
 * named, goal-scoped kinds keep only its records and events keep only those
 * about its aggregates. The directory is Jarvis's whole world: it is mounted
 * read-only and is kept afterwards as the evidence behind the answer.
 */
export const writeEvidence = async (input: {
  directory: string
  fetcher?: typeof fetch
  goalId: string | null
  readApiUrl: string
}): Promise<EvidenceDirectory> => {
  const fetcher = input.fetcher ?? fetch
  await mkdir(input.directory, { recursive: true })
  const loaded = new Map<EvidenceKind, Array<Record<string, unknown>>>()
  for (const source of sources) {
    const response = await fetcher(new URL(source.path, input.readApiUrl))
    if (!response.ok) {
      throw new Error(`Read API ${source.path} returned ${response.status}`)
    }
    const payload = (await response.json()) as Record<string, unknown>
    const records = (Array.isArray(payload[listKey[source.kind]]) ? payload[listKey[source.kind]] : []) as Array<
      Record<string, unknown>
    >
    loaded.set(
      source.kind,
      input.goalId === null || source.goalOf === undefined
        ? records
        : records.filter((record) => source.goalOf?.(record) === input.goalId)
    )
  }
  if (input.goalId !== null) {
    const related = new Set(
      [...loaded.entries()]
        .filter(([kind]) => kind !== "event")
        .flatMap(([, records]) => records.map((record) => String(record.id)))
    )
    loaded.set(
      "event",
      (loaded.get("event") ?? []).filter((event) => related.has(String(event.aggregateId)))
    )
  }
  const known = new Map<string, Set<string>>()
  const manifest: EvidenceDirectory["manifest"] = []
  for (const source of sources) {
    const records = loaded.get(source.kind) ?? []
    known.set(source.kind, new Set(records.flatMap((record) => source.idOf(record) ?? [])))
    manifest.push({ count: records.length, file: source.file, kind: source.kind })
    await writeFile(join(input.directory, source.file), `${JSON.stringify(records, null, 2)}\n`)
  }
  await writeFile(
    join(input.directory, "MANIFEST.json"),
    `${JSON.stringify({ goalId: input.goalId, manifest, writtenAt: new Date().toISOString() }, null, 2)}\n`
  )
  return { known, manifest, path: input.directory }
}
