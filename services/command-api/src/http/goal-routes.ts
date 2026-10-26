/** @module Goal command and diagnostic routes. */

import { goalSubmissionSchema } from "@evergreen-terrace/contracts"
import { jsonError } from "@evergreen-terrace/service-runtime"
import type { HttpRoute } from "@evergreen-terrace/service-runtime"
import type { CommandDatabase } from "../persistence/command-database"
import { parseCommandBody } from "./command-route-input"

export const goalRoutes = (database: CommandDatabase): HttpRoute[] => [
  {
    handle: async ({ request }) => {
      const input = await parseCommandBody(request, goalSubmissionSchema, "invalid_goal_submission")
      if (input instanceof Response) {
        return input
      }
      try {
        const result = await database.submitGoal(input)
        return Response.json(result, { status: result.created ? 201 : 200 })
      } catch (error) {
        return jsonError(500, "goal_submission_failed", "Unable to persist goal submission", {
          message: error instanceof Error ? error.message : "unknown error"
        })
      }
    },
    method: "POST",
    name: "goals.submit",
    path: "/v1/goals"
  },
  {
    handle: async ({ url }) => Response.json({ goals: await database.listGoals(url.searchParams.get("projectId")) }),
    method: "GET",
    name: "goals.list",
    path: "/v1/goals"
  }
]
