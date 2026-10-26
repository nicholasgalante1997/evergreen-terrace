/** @module Worker diagnostic-query routes. */

import { requiredRouteParam } from "@evergreen-terrace/service-runtime"
import type { HttpRoute } from "@evergreen-terrace/service-runtime"
import type { CommandDatabase } from "../persistence/command-database"
import { workerErrorResponse } from "./command-route-errors"

export const workerQueryRoutes = (database: CommandDatabase): HttpRoute[] => [
  {
    handle: async ({ url }) => Response.json({ workers: await database.listWorkers(url.searchParams.get("projectId")) }),
    method: "GET",
    name: "workers.list",
    path: "/v1/workers"
  },
  {
    handle: async ({ params }) => {
      try {
        return Response.json(await database.getWorker(requiredRouteParam(params, "workerId")))
      } catch (error) {
        return workerErrorResponse(error, "worker_lookup_failed")
      }
    },
    method: "GET",
    name: "workers.get",
    path: "/v1/workers/:workerId"
  }
]
