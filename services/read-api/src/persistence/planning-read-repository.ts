/** @module Read-model plan, onboarding, and preference repository. */

import {
  onboardingUpdatedPayloadSchema,
  planUpdatedPayloadSchema,
  preferenceUpdatedPayloadSchema
} from "@evergreen-terrace/contracts"
import { PostgresRepository } from "@evergreen-terrace/persistence"
import type { SQL } from "bun"
import type { ReadOnboarding, ReadPlan, ReadPreference } from "./planning-read-repository.types"

const jsonValue = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value)

const freshness = (row: Record<string, unknown>) => ({
  lastEventId: String(row.last_event_id),
  updatedAt: new Date(String(row.updated_at))
})

export class PlanningReadRepository extends PostgresRepository {
  constructor(sql: SQL) {
    super(sql)
  }

  async listPlans(projectId: string | null, goalId: string | null): Promise<ReadPlan[]> {
    const rows =
      goalId !== null
        ? await this.sql`SELECT * FROM evergreen_read.plans WHERE goal_id = ${goalId} ORDER BY updated_at DESC`
        : projectId !== null
          ? await this.sql`SELECT * FROM evergreen_read.plans WHERE project_id = ${projectId} ORDER BY updated_at DESC`
          : await this.sql`SELECT * FROM evergreen_read.plans ORDER BY updated_at DESC LIMIT 200`
    return rows.map((row: Record<string, unknown>) => ({
      ...planUpdatedPayloadSchema.shape.plan.parse(jsonValue(row.state)),
      ...freshness(row)
    }))
  }

  async listOnboardings(projectId: string | null): Promise<ReadOnboarding[]> {
    const rows =
      projectId === null
        ? await this.sql`SELECT * FROM evergreen_read.onboardings ORDER BY updated_at DESC LIMIT 200`
        : await this
            .sql`SELECT * FROM evergreen_read.onboardings WHERE project_id = ${projectId} ORDER BY updated_at DESC`
    return rows.map((row: Record<string, unknown>) => ({
      ...onboardingUpdatedPayloadSchema.shape.onboarding.parse(jsonValue(row.state)),
      ...freshness(row)
    }))
  }

  /** Global preferences plus, when given, one project's own. */
  async listPreferences(projectId: string | null): Promise<ReadPreference[]> {
    const rows = await this.sql`
      SELECT * FROM evergreen_read.preferences
      WHERE project_id IS NULL OR project_id = ${projectId}
      ORDER BY updated_at DESC
      LIMIT 200
    `
    return rows.map((row: Record<string, unknown>) => ({
      ...preferenceUpdatedPayloadSchema.shape.preference.parse(jsonValue(row.state)),
      ...freshness(row)
    }))
  }
}
