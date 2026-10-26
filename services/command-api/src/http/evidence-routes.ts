/** @module Validation and integration-train evidence routes. */

import { integrationCompletionSchema, integrationStartSchema, validationRecordSchema } from "@evergreen-terrace/contracts"
import { requiredRouteParam } from "@evergreen-terrace/service-runtime"
import type { HttpRoute } from "@evergreen-terrace/service-runtime"
import type { CommandDatabase } from "../persistence/command-database"
import { evidenceErrorResponse } from "./command-route-errors"
import { parseCommandBody } from "./command-route-input"

export const evidenceRoutes = (database: CommandDatabase): HttpRoute[] => [
  {
    handle: async ({ params }) => {
      try {
        return Response.json(await database.getGoal(requiredRouteParam(params, "goalId")))
      } catch (error) {
        return evidenceErrorResponse(error, "goal_lookup_failed")
      }
    },
    method: "GET",
    name: "goals.get",
    path: "/v1/goals/:goalId"
  },
  {
    handle: async ({ request }) => {
      const input = await parseCommandBody(request, validationRecordSchema, "invalid_validation")
      if (input instanceof Response) {
        return input
      }
      try {
        const result = await database.recordValidation(input)
        return Response.json(result, { status: result.created ? 201 : 200 })
      } catch (error) {
        return evidenceErrorResponse(error, "validation_record_failed")
      }
    },
    method: "POST",
    name: "validations.record",
    path: "/v1/validations"
  },
  {
    handle: async ({ params }) =>
      Response.json({ validations: await database.listGoalValidations(requiredRouteParam(params, "goalId")) }),
    method: "GET",
    name: "goals.validations.list",
    path: "/v1/goals/:goalId/validations"
  },
  {
    handle: async ({ request }) => {
      const input = await parseCommandBody(request, integrationStartSchema, "invalid_integration_start")
      if (input instanceof Response) {
        return input
      }
      try {
        const result = await database.startIntegration(input)
        return Response.json(result, { status: result.created ? 201 : 200 })
      } catch (error) {
        return evidenceErrorResponse(error, "integration_start_failed")
      }
    },
    method: "POST",
    name: "integrations.start",
    path: "/v1/integrations"
  },
  {
    handle: async ({ params, request }) => {
      const input = await parseCommandBody(request, integrationCompletionSchema, "invalid_integration_completion")
      if (input instanceof Response) {
        return input
      }
      try {
        return Response.json(await database.completeIntegration(requiredRouteParam(params, "integrationId"), input))
      } catch (error) {
        return evidenceErrorResponse(error, "integration_completion_failed")
      }
    },
    method: "POST",
    name: "integrations.complete",
    path: "/v1/integrations/:integrationId/complete"
  },
  {
    handle: async ({ params }) => {
      try {
        return Response.json(await database.getIntegration(requiredRouteParam(params, "integrationId")))
      } catch (error) {
        return evidenceErrorResponse(error, "integration_lookup_failed")
      }
    },
    method: "GET",
    name: "integrations.get",
    path: "/v1/integrations/:integrationId"
  },
  {
    handle: async ({ params }) =>
      Response.json({ integrations: await database.listGoalIntegrations(requiredRouteParam(params, "goalId")) }),
    method: "GET",
    name: "goals.integrations.list",
    path: "/v1/goals/:goalId/integrations"
  }
]
