import { readFile, appendFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import { join } from "path"
import toml from "toml"
import type { MetricEvent, SentinelRun, VelocityPoint, SentinelHistory } from "./types"

function eventToToml(event: MetricEvent): string {
  return `\n[[events]]\nts = "${event.ts}"\ntype = "${event.type}"\nitem_id = "${event.item_id}"\nproject = "${event.project}"\npriority = "${event.priority}"\nagent = "${event.agent}"\n`
}

function sentinelRunToToml(run: SentinelRun): string {
  const scores = Object.entries(run.scores)
    .map(([k, v]) => `"${k}" = ${v}`)
    .join(", ")
  return `\n[[runs]]\nts = "${run.ts}"\nmode = "${run.mode}"\nscores = { ${scores} }\noverall = "${run.overall}"\n`
}

export function createMetricsStore(metricsDir: string) {
  const queuePath = join(metricsDir, "queue.toml")
  const sentinelPath = join(metricsDir, "sentinel.toml")

  async function ensureDir(): Promise<void> {
    if (!existsSync(metricsDir)) {
      await mkdir(metricsDir, { recursive: true })
    }
  }

  async function readTomlFile<T>(path: string, key: string): Promise<T[]> {
    if (!existsSync(path)) return []
    const content = await readFile(path, "utf-8")
    if (!content.trim()) return []
    const parsed = toml.parse(content) as Record<string, T[]>
    return parsed[key] ?? []
  }

  async function appendEvent(event: MetricEvent): Promise<void> {
    await ensureDir()
    await appendFile(queuePath, eventToToml(event))
  }

  async function appendSentinelRun(run: SentinelRun): Promise<void> {
    await ensureDir()
    await appendFile(sentinelPath, sentinelRunToToml(run))
  }

  async function getQueueEvents(): Promise<MetricEvent[]> {
    return readTomlFile<MetricEvent>(queuePath, "events")
  }

  async function getSentinelRuns(): Promise<SentinelRun[]> {
    return readTomlFile<SentinelRun>(sentinelPath, "runs")
  }

  async function getVelocity(): Promise<VelocityPoint[]> {
    const events = await getQueueEvents()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const dayMap = new Map<string, VelocityPoint>()

    for (const event of events) {
      const eventDate = new Date(event.ts)
      if (eventDate < thirtyDaysAgo) continue
      const date = event.ts.slice(0, 10)
      const point = dayMap.get(date) ?? { date, created: 0, delegated: 0, completed: 0 }
      if (event.type === "item_created") point.created++
      else if (event.type === "item_delegated") point.delegated++
      else if (event.type === "item_completed") point.completed++
      dayMap.set(date, point)
    }

    return [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date))
  }

  async function getSentinelHistory(): Promise<SentinelHistory[]> {
    const runs = await getSentinelRuns()
    const last10 = runs.slice(-10)
    const projectMap = new Map<string, Array<{ ts: string; score: number }>>()

    for (const run of last10) {
      for (const [project, score] of Object.entries(run.scores)) {
        const arr = projectMap.get(project) ?? []
        arr.push({ ts: run.ts, score })
        projectMap.set(project, arr)
      }
    }

    return [...projectMap.entries()].map(([project, runs]) => ({ project, runs }))
  }

  return { appendEvent, appendSentinelRun, getQueueEvents, getSentinelRuns, getVelocity, getSentinelHistory }
}
