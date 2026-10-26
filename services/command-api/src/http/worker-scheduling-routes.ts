/** @module Worker brief, scheduler-lease, and goal-schedule routes. */

import {
  workerBriefSchema,
  workerLeaseAcquireSchema,
  workerLeaseReconcileSchema,
  workerLeaseReleaseSchema,
  workerLeaseRenewSchema
} from "@evergreen-terrace/contracts"
import { requiredRouteParam } from "@evergreen-terrace/service-runtime"
import type { HttpRoute, HttpRouteContext } from "@evergreen-terrace/service-runtime"
import type { CommandDatabase } from "../persistence/command-database"
import { workerErrorResponse } from "./command-route-errors"
import { parseCommandBody } from "./command-route-input"

interface BodySchema<Output> {
  safeParse(value: unknown): { data: Output; success: true } | { error: { issues: unknown }; success: false }
}

const workerCommand =
  <Input, Result>(
    schema: BodySchema<Input>,
    invalidCode: string,
    failureCode: string,
    run: (workerId: string, input: Input) => Promise<Result>,
    status: (result: Result) => number = () => 200
  ) =>
  async ({ params, request }: HttpRouteContext): Promise<Response> => {
    const input = await parseCommandBody(request, schema, invalidCode)
    if (input instanceof Response) {
      return input
    }
    try {
      const result = await run(requiredRouteParam(params, "workerId"), input)
      return Response.json(result, { status: status(result) })
    } catch (error) {
      return workerErrorResponse(error, failureCode)
    }
  }

export const workerSchedulingRoutes = (database: CommandDatabase): HttpRoute[] => [
  {
    handle: workerCommand(
      workerBriefSchema,
      "invalid_worker_brief",
      "worker_brief_failed",
      (workerId, input) => database.recordWorkerBrief(workerId, input),
      (result) => (result.recorded ? 201 : 200)
    ),
    method: "POST",
    name: "workers.brief.record",
    path: "/v1/workers/:workerId/brief"
  },
  {
    handle: async ({ params }) => {
      try {
        return Response.json(await database.getWorkerBrief(requiredRouteParam(params, "workerId")))
      } catch (error) {
        return workerErrorResponse(error, "worker_brief_lookup_failed")
      }
    },
    method: "GET",
    name: "workers.brief.get",
    path: "/v1/workers/:workerId/brief"
  },
  {
    handle: workerCommand(
      workerLeaseAcquireSchema,
      "invalid_worker_lease",
      "worker_lease_failed",
      (workerId, input) => database.acquireWorkerLease(workerId, input),
      (result) => (result.changed ? 201 : 200)
    ),
    method: "POST",
    name: "workers.lease.acquire",
    path: "/v1/workers/:workerId/lease"
  },
  {
    handle: workerCommand(workerLeaseRenewSchema, "invalid_worker_lease", "worker_lease_failed", (workerId, input) =>
      database.renewWorkerLease(workerId, input)
    ),
    method: "POST",
    name: "workers.lease.renew",
    path: "/v1/workers/:workerId/lease/renew"
  },
  {
    handle: workerCommand(workerLeaseReleaseSchema, "invalid_worker_lease", "worker_lease_failed", (workerId, input) =>
      database.releaseWorkerLease(workerId, input)
    ),
    method: "POST",
    name: "workers.lease.release",
    path: "/v1/workers/:workerId/lease/release"
  },
  {
    handle: workerCommand(workerLeaseReconcileSchema, "invalid_worker_lease", "worker_lease_failed", (workerId, input) =>
      database.reconcileWorkerLease(workerId, input)
    ),
    method: "POST",
    name: "workers.lease.reconcile",
    path: "/v1/workers/:workerId/lease/reconcile"
  },
  {
    handle: async ({ params }) =>
      Response.json({ workers: await database.listGoalWorkers(requiredRouteParam(params, "goalId")) }),
    method: "GET",
    name: "goals.workers.list",
    path: "/v1/goals/:goalId/workers"
  }
]
