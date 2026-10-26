/** @module Repository-onboarding routes. */

import {
  onboardingApplyCompletionSchema,
  onboardingDiscoveryCompletionSchema,
  onboardingStartSchema
} from "@evergreen-terrace/contracts"
import { jsonError, requiredRouteParam } from "@evergreen-terrace/service-runtime"
import type { HttpRoute } from "@evergreen-terrace/service-runtime"
import type { CommandDatabase } from "../persistence/command-database"
import { evidenceErrorResponse } from "./command-route-errors"
import { parseCommandBody } from "./command-route-input"

export const onboardingRoutes = (database: CommandDatabase): HttpRoute[] => [
  {
    handle: async ({ request }) => {
      const input = await parseCommandBody(request, onboardingStartSchema, "invalid_onboarding_start")
      if (input instanceof Response) {
        return input
      }
      try {
        const result = await database.startOnboarding(input)
        return Response.json(result, { status: result.created ? 201 : 200 })
      } catch (error) {
        return evidenceErrorResponse(error, "onboarding_start_failed")
      }
    },
    method: "POST",
    name: "onboardings.start",
    path: "/v1/onboardings"
  },
  {
    handle: async ({ params, request }) => {
      const input = await parseCommandBody(request, onboardingDiscoveryCompletionSchema, "invalid_onboarding_discovery")
      if (input instanceof Response) {
        return input
      }
      try {
        return Response.json(
          await database.completeOnboardingDiscovery(requiredRouteParam(params, "onboardingId"), input)
        )
      } catch (error) {
        return evidenceErrorResponse(error, "onboarding_discovery_failed")
      }
    },
    method: "POST",
    name: "onboardings.discovery.complete",
    path: "/v1/onboardings/:onboardingId/discovery/complete"
  },
  {
    handle: async ({ params }) => {
      try {
        return Response.json(await database.beginOnboardingApply(requiredRouteParam(params, "onboardingId")))
      } catch (error) {
        return evidenceErrorResponse(error, "onboarding_apply_begin_failed")
      }
    },
    method: "POST",
    name: "onboardings.apply.begin",
    path: "/v1/onboardings/:onboardingId/apply/begin"
  },
  {
    handle: async ({ params, request }) => {
      const input = await parseCommandBody(request, onboardingApplyCompletionSchema, "invalid_onboarding_apply")
      if (input instanceof Response) {
        return input
      }
      try {
        return Response.json(await database.completeOnboardingApply(requiredRouteParam(params, "onboardingId"), input))
      } catch (error) {
        return evidenceErrorResponse(error, "onboarding_apply_failed")
      }
    },
    method: "POST",
    name: "onboardings.apply.complete",
    path: "/v1/onboardings/:onboardingId/apply/complete"
  },
  {
    handle: async ({ params }) => {
      try {
        return Response.json(await database.getOnboarding(requiredRouteParam(params, "onboardingId")))
      } catch (error) {
        return evidenceErrorResponse(error, "onboarding_lookup_failed")
      }
    },
    method: "GET",
    name: "onboardings.get",
    path: "/v1/onboardings/:onboardingId"
  },
  {
    handle: async ({ url }) => {
      const projectId = url.searchParams.get("projectId")
      if (projectId === null) {
        return jsonError(400, "invalid_onboarding_query", "Listing onboardings requires projectId")
      }
      return Response.json({ onboardings: await database.listProjectOnboardings(projectId) })
    },
    method: "GET",
    name: "onboardings.list",
    path: "/v1/onboardings"
  }
]
