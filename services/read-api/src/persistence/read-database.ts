/** @module Read-only read-model database adapter. */

import { PostgresDatabase } from "@evergreen-terrace/persistence"
import { DecisionReadRepository } from "./decision-read-repository"
import { EventReadRepository } from "./event-read-repository"
import type { ReadEvent } from "./event-read-repository.types"
import { EvidenceReadRepository } from "./evidence-read-repository"
import type { ReadHandoff, ReadIntegration, ReadValidation } from "./evidence-read-repository.types"
import { GoalReadRepository } from "./goal-read-repository"
import { PlanningReadRepository } from "./planning-read-repository"
import type { ReadOnboarding, ReadPlan, ReadPreference } from "./planning-read-repository.types"
import { ProjectionFreshnessRepository } from "./projection-freshness-repository"
import { WorkerReadRepository } from "./worker-read-repository"
import type { ReadGoal } from "./goal-read-repository.types"
import type { ProjectionFreshness } from "./projection-freshness-repository.types"
import type { ReadDecision } from "./decision-read-repository.types"
import type { ReadWorker } from "./worker-read-repository.types"

export class ReadDatabase extends PostgresDatabase {
  constructor(url: string) {
    super({
      applicationName: "evergreen-read-api",
      connectionLimit: 10,
      session: { default_transaction_read_only: "on" },
      url
    })
  }

  async listGoals(projectId: string | null): Promise<ReadGoal[]> {
    return new GoalReadRepository(this.sql).list(projectId)
  }

  async listDecisions(projectId: string | null): Promise<ReadDecision[]> {
    return new DecisionReadRepository(this.sql).list(projectId)
  }

  async listWorkers(projectId: string | null): Promise<ReadWorker[]> {
    return new WorkerReadRepository(this.sql).list(projectId)
  }

  async listValidations(projectId: string | null): Promise<ReadValidation[]> {
    return new EvidenceReadRepository(this.sql).listValidations(projectId)
  }

  async listHandoffs(projectId: string | null): Promise<ReadHandoff[]> {
    return new EvidenceReadRepository(this.sql).listHandoffs(projectId)
  }

  async listIntegrations(projectId: string | null): Promise<ReadIntegration[]> {
    return new EvidenceReadRepository(this.sql).listIntegrations(projectId)
  }

  async listPlans(projectId: string | null, goalId: string | null): Promise<ReadPlan[]> {
    return new PlanningReadRepository(this.sql).listPlans(projectId, goalId)
  }

  async listOnboardings(projectId: string | null): Promise<ReadOnboarding[]> {
    return new PlanningReadRepository(this.sql).listOnboardings(projectId)
  }

  async listPreferences(projectId: string | null): Promise<ReadPreference[]> {
    return new PlanningReadRepository(this.sql).listPreferences(projectId)
  }

  async listRecentEvents(limit: number): Promise<ReadEvent[]> {
    return new EventReadRepository(this.sql).listRecent(limit)
  }

  async getConsoleFreshness(): Promise<ProjectionFreshness | null> {
    return new ProjectionFreshnessRepository(this.sql).getConsoleFreshness()
  }

  protected async migrate(): Promise<void> {
    // The projection service owns the read schema. This role has no DDL authority.
  }
}
