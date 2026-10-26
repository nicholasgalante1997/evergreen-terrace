/** @module Decision diagnostic-query routes. */

import { requiredRouteParam } from "@evergreen-terrace/service-runtime"
import type { HttpRoute } from "@evergreen-terrace/service-runtime"
import type { CommandDatabase } from "../persistence/command-database"
import { decisionErrorResponse } from "./command-route-errors"

export const decisionQueryRoutes = (database: CommandDatabase): HttpRoute[] => [
  {
    handle: async ({ url }) => Response.json({ decisions: await database.listDecisions(url.searchParams.get("projectId")) }),
    method: "GET",
    name: "decisions.list",
    path: "/v1/decisions"
  },
  {
    handle: async ({ params }) => {
      try {
        return Response.json(await database.getDecision(requiredRouteParam(params, "decisionId")))
      } catch (error) {
        return decisionErrorResponse(error, "decision_lookup_failed")
      }
    },
    method: "GET",
    name: "decisions.get",
    path: "/v1/decisions/:decisionId"
  }
]
