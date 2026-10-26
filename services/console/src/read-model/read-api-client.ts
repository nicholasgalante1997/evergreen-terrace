/** @module Read-only client for the projection read API; the console never touches command state. */

import type { ConsoleFreshness, ConsoleSnapshot } from "./read-model.types"

export class ReadApiClient {
  constructor(
    private readonly endpoint: string,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async freshness(): Promise<ConsoleFreshness | null> {
    return ((await this.get("/v1/projection/freshness")) as { freshness: ConsoleFreshness | null }).freshness
  }

  /** One consistent-enough pass: every list is current only through the projection watermark it reports. */
  async snapshot(): Promise<ConsoleSnapshot> {
    const list = async <T>(path: string, key: string): Promise<T[]> => {
      const payload = (await this.get(path)) as Record<string, unknown>
      return Array.isArray(payload[key]) ? (payload[key] as T[]) : []
    }
    const [
      freshness,
      goals,
      decisions,
      workers,
      validations,
      integrations,
      handoffs,
      plans,
      onboardings,
      preferences,
      events
    ] = await Promise.all([
      this.freshness(),
      list<ConsoleSnapshot["goals"][number]>("/v1/goals", "goals"),
      list<ConsoleSnapshot["decisions"][number]>("/v1/decisions", "decisions"),
      list<ConsoleSnapshot["workers"][number]>("/v1/workers", "workers"),
      list<ConsoleSnapshot["validations"][number]>("/v1/validations", "validations"),
      list<ConsoleSnapshot["integrations"][number]>("/v1/integrations", "integrations"),
      list<ConsoleSnapshot["handoffs"][number]>("/v1/handoffs", "handoffs"),
      list<ConsoleSnapshot["plans"][number]>("/v1/plans", "plans"),
      list<ConsoleSnapshot["onboardings"][number]>("/v1/onboardings", "onboardings"),
      list<ConsoleSnapshot["preferences"][number]>("/v1/preferences", "preferences"),
      list<ConsoleSnapshot["events"][number]>("/v1/events?limit=100", "events")
    ])
    return {
      decisions,
      events,
      freshness,
      goals,
      handoffs,
      integrations,
      onboardings,
      plans,
      preferences,
      readAt: new Date().toISOString(),
      validations,
      workers
    }
  }

  private async get(path: string): Promise<unknown> {
    const response = await this.fetcher(new URL(path, this.endpoint))
    if (!response.ok) {
      throw new Error(`Read API ${path} returned ${response.status}`)
    }
    return response.json()
  }
}
