/** @module Worker mutation routes. */

import { workerAssignmentSchema, workerStateChangeSchema } from "@evergreen-terrace/contracts"
import { requiredRouteParam } from "@evergreen-terrace/service-runtime"
import type { HttpRoute } from "@evergreen-terrace/service-runtime"
import type { CommandDatabase } from "../persistence/command-database"
import { workerErrorResponse } from "./command-route-errors"
import { parseCommandBody } from "./command-route-input"

export const workerCommandRoutes = (database: CommandDatabase): HttpRoute[] => [
  {
    handle: async ({ request }) => {
      const input = await parseCommandBody(request, workerAssignmentSchema, "invalid_worker_assignment")
      if (input instanceof Response) {
        return input
      }
      try {
        const result = await database.assignWorker(input)
        return Response.json(result, { status: result.created ? 201 : 200 })
      } catch (error) {
        return workerErrorResponse(error, "worker_assignment_failed")
      }
    },
    method: "POST",
    name: "workers.assign",
    path: "/v1/workers"
  },
  {
    handle: async ({ params, request }) => {
      const input = await parseCommandBody(request, workerStateChangeSchema, "invalid_worker_state")
      if (input instanceof Response) {
        return input
      }
      try {
        return Response.json(await database.changeWorkerState(requiredRouteParam(params, "workerId"), input))
      } catch (error) {
        return workerErrorResponse(error, "worker_state_change_failed")
      }
    },
    method: "POST",
    name: "workers.change_state",
    path: "/v1/workers/:workerId/state"
  }
]
