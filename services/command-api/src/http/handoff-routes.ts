/** @module GitHub handoff routes. */

import { handoffCompletionSchema, handoffRequestSchema } from "@evergreen-terrace/contracts"
import { requiredRouteParam } from "@evergreen-terrace/service-runtime"
import type { HttpRoute } from "@evergreen-terrace/service-runtime"
import type { CommandDatabase } from "../persistence/command-database"
import { evidenceErrorResponse } from "./command-route-errors"
import { parseCommandBody } from "./command-route-input"

export const handoffRoutes = (database: CommandDatabase): HttpRoute[] => [
  {
    handle: async ({ request }) => {
      const input = await parseCommandBody(request, handoffRequestSchema, "invalid_handoff_request")
      if (input instanceof Response) {
        return input
      }
      try {
        const result = await database.requestHandoff(input)
        return Response.json(result, { status: result.created ? 201 : 200 })
      } catch (error) {
        return evidenceErrorResponse(error, "handoff_request_failed")
      }
    },
    method: "POST",
    name: "handoffs.request",
    path: "/v1/handoffs"
  },
  {
    handle: async ({ params }) => {
      try {
        return Response.json(await database.beginHandoff(requiredRouteParam(params, "handoffId")))
      } catch (error) {
        return evidenceErrorResponse(error, "handoff_begin_failed")
      }
    },
    method: "POST",
    name: "handoffs.begin",
    path: "/v1/handoffs/:handoffId/begin"
  },
  {
    handle: async ({ params, request }) => {
      const input = await parseCommandBody(request, handoffCompletionSchema, "invalid_handoff_completion")
      if (input instanceof Response) {
        return input
      }
      try {
        return Response.json(await database.completeHandoff(requiredRouteParam(params, "handoffId"), input))
      } catch (error) {
        return evidenceErrorResponse(error, "handoff_completion_failed")
      }
    },
    method: "POST",
    name: "handoffs.complete",
    path: "/v1/handoffs/:handoffId/complete"
  },
  {
    handle: async ({ params }) => {
      try {
        return Response.json(await database.getHandoff(requiredRouteParam(params, "handoffId")))
      } catch (error) {
        return evidenceErrorResponse(error, "handoff_lookup_failed")
      }
    },
    method: "GET",
    name: "handoffs.get",
    path: "/v1/handoffs/:handoffId"
  },
  {
    handle: async ({ params }) =>
      Response.json({ handoffs: await database.listGoalHandoffs(requiredRouteParam(params, "goalId")) }),
    method: "GET",
    name: "goals.handoffs.list",
    path: "/v1/goals/:goalId/handoffs"
  }
]
