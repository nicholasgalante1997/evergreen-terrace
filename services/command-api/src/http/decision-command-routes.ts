/** @module Decision mutation routes. */

import { decisionRequestSchema, decisionResolutionSchema } from "@evergreen-terrace/contracts"
import { requiredRouteParam } from "@evergreen-terrace/service-runtime"
import type { HttpRoute } from "@evergreen-terrace/service-runtime"
import type { CommandDatabase } from "../persistence/command-database"
import { decisionErrorResponse } from "./command-route-errors"
import { parseCommandBody } from "./command-route-input"

export const decisionCommandRoutes = (database: CommandDatabase): HttpRoute[] => [
  {
    handle: async ({ request }) => {
      const input = await parseCommandBody(request, decisionRequestSchema, "invalid_decision_request")
      if (input instanceof Response) {
        return input
      }
      try {
        const result = await database.requestDecision(input)
        return Response.json(result, { status: result.created ? 201 : 200 })
      } catch (error) {
        return decisionErrorResponse(error, "decision_request_failed")
      }
    },
    method: "POST",
    name: "decisions.request",
    path: "/v1/decisions"
  },
  {
    handle: async ({ params, request }) => {
      const input = await parseCommandBody(request, decisionResolutionSchema, "invalid_decision_resolution")
      if (input instanceof Response) {
        return input
      }
      try {
        return Response.json(await database.resolveDecision(requiredRouteParam(params, "decisionId"), input))
      } catch (error) {
        return decisionErrorResponse(error, "decision_resolution_failed")
      }
    },
    method: "POST",
    name: "decisions.resolve",
    path: "/v1/decisions/:decisionId/resolve"
  }
]
