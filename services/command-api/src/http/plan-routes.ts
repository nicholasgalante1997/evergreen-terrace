/** @module Mayor goal-plan routes. */

import { planDraftCompletionSchema, planDraftStartSchema, planLaunchCompletionSchema } from "@evergreen-terrace/contracts"
import { jsonError, requiredRouteParam } from "@evergreen-terrace/service-runtime"
import type { HttpRoute } from "@evergreen-terrace/service-runtime"
import type { CommandDatabase } from "../persistence/command-database"
import { evidenceErrorResponse } from "./command-route-errors"
import { parseCommandBody } from "./command-route-input"

export const planRoutes = (database: CommandDatabase): HttpRoute[] => [
  {
    handle: async ({ request }) => {
      const input = await parseCommandBody(request, planDraftStartSchema, "invalid_plan_draft")
      if (input instanceof Response) {
        return input
      }
      try {
        const result = await database.startPlanDraft(input)
        return Response.json(result, { status: result.created ? 201 : 200 })
      } catch (error) {
        return evidenceErrorResponse(error, "plan_draft_failed")
      }
    },
    method: "POST",
    name: "plans.draft",
    path: "/v1/plans"
  },
  {
    handle: async ({ params, request }) => {
      const input = await parseCommandBody(request, planDraftCompletionSchema, "invalid_plan_draft_completion")
      if (input instanceof Response) {
        return input
      }
      try {
        return Response.json(await database.completePlanDraft(requiredRouteParam(params, "planId"), input))
      } catch (error) {
        return evidenceErrorResponse(error, "plan_draft_completion_failed")
      }
    },
    method: "POST",
    name: "plans.draft.complete",
    path: "/v1/plans/:planId/draft/complete"
  },
  {
    handle: async ({ params }) => {
      try {
        return Response.json(await database.beginPlanLaunch(requiredRouteParam(params, "planId")))
      } catch (error) {
        return evidenceErrorResponse(error, "plan_launch_begin_failed")
      }
    },
    method: "POST",
    name: "plans.launch.begin",
    path: "/v1/plans/:planId/launch/begin"
  },
  {
    handle: async ({ params, request }) => {
      const input = await parseCommandBody(request, planLaunchCompletionSchema, "invalid_plan_launch_completion")
      if (input instanceof Response) {
        return input
      }
      try {
        return Response.json(await database.completePlanLaunch(requiredRouteParam(params, "planId"), input))
      } catch (error) {
        return evidenceErrorResponse(error, "plan_launch_completion_failed")
      }
    },
    method: "POST",
    name: "plans.launch.complete",
    path: "/v1/plans/:planId/launch/complete"
  },
  {
    handle: async ({ params }) => {
      try {
        return Response.json(await database.getPlan(requiredRouteParam(params, "planId")))
      } catch (error) {
        return evidenceErrorResponse(error, "plan_lookup_failed")
      }
    },
    method: "GET",
    name: "plans.get",
    path: "/v1/plans/:planId"
  },
  {
    handle: async ({ url }) => {
      const projectId = url.searchParams.get("projectId")
      if (projectId === null || url.searchParams.get("active") !== "true") {
        return jsonError(400, "invalid_plan_query", "Listing plans requires projectId and active=true")
      }
      return Response.json({ plans: await database.listActiveProjectPlans(projectId) })
    },
    method: "GET",
    name: "plans.active",
    path: "/v1/plans"
  },
  {
    handle: async ({ params }) =>
      Response.json({ plans: await database.listGoalPlans(requiredRouteParam(params, "goalId")) }),
    method: "GET",
    name: "goals.plans.list",
    path: "/v1/goals/:goalId/plans"
  }
]
