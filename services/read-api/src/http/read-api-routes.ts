/** @module Read-model query route definitions. */

import type { HttpRoute } from "@evergreen-terrace/service-runtime"
import type { ReadDatabase } from "../persistence/read-database"

export const readApiRoutes = (database: ReadDatabase): HttpRoute[] => [
  {
    handle: async ({ url }) => Response.json({ goals: await database.listGoals(url.searchParams.get("projectId")) }),
    method: "GET",
    name: "goals.list",
    path: "/v1/goals"
  },
  {
    handle: async ({ url }) =>
      Response.json({ decisions: await database.listDecisions(url.searchParams.get("projectId")) }),
    method: "GET",
    name: "decisions.list",
    path: "/v1/decisions"
  },
  {
    handle: async ({ url }) => Response.json({ workers: await database.listWorkers(url.searchParams.get("projectId")) }),
    method: "GET",
    name: "workers.list",
    path: "/v1/workers"
  },
  {
    handle: async ({ url }) =>
      Response.json({ validations: await database.listValidations(url.searchParams.get("projectId")) }),
    method: "GET",
    name: "validations.list",
    path: "/v1/validations"
  },
  {
    handle: async ({ url }) =>
      Response.json({ integrations: await database.listIntegrations(url.searchParams.get("projectId")) }),
    method: "GET",
    name: "integrations.list",
    path: "/v1/integrations"
  },
  {
    handle: async ({ url }) =>
      Response.json({ handoffs: await database.listHandoffs(url.searchParams.get("projectId")) }),
    method: "GET",
    name: "handoffs.list",
    path: "/v1/handoffs"
  },
  {
    handle: async ({ url }) =>
      Response.json({
        plans: await database.listPlans(url.searchParams.get("projectId"), url.searchParams.get("goalId"))
      }),
    method: "GET",
    name: "plans.list",
    path: "/v1/plans"
  },
  {
    handle: async ({ url }) =>
      Response.json({ onboardings: await database.listOnboardings(url.searchParams.get("projectId")) }),
    method: "GET",
    name: "onboardings.list",
    path: "/v1/onboardings"
  },
  {
    handle: async ({ url }) =>
      Response.json({ preferences: await database.listPreferences(url.searchParams.get("projectId")) }),
    method: "GET",
    name: "preferences.list",
    path: "/v1/preferences"
  },
  {
    handle: async ({ url }) => {
      const requested = Number(url.searchParams.get("limit") ?? 50)
      const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 200) : 50
      return Response.json({ events: await database.listRecentEvents(limit) })
    },
    method: "GET",
    name: "events.recent",
    path: "/v1/events"
  },
  {
    handle: async () => Response.json({ freshness: await database.getConsoleFreshness() }),
    method: "GET",
    name: "projection.freshness",
    path: "/v1/projection/freshness"
  }
]
