/** @module Shared HTTP health, readiness, and domain-response boundary. */

import type { ReadinessCheck } from "./http-server.types"
import type { HttpRequestResponderOptions } from "./http-request-responder.types"

const readinessResponse = async (service: string, checks: ReadonlyArray<ReadinessCheck>): Promise<Response> => {
  const results = await Promise.allSettled(checks.map(async (check) => check.check()))
  const failedChecks = results.flatMap((result, index) => {
    if (result.status === "fulfilled") {
      return []
    }
    return [checks[index]?.name ?? "unknown"]
  })
  return failedChecks.length === 0
    ? Response.json({ service, status: "ready" })
    : Response.json({ service, status: "not_ready", failedChecks }, { status: 503 })
}

const systemResponse = (request: Request, service: string, checks: ReadonlyArray<ReadinessCheck>): Response | Promise<Response> | undefined => {
  const pathname = new URL(request.url).pathname
  if (request.method === "GET" && pathname === "/healthz") {
    return Response.json({ service, status: "ok" })
  }
  return request.method === "GET" && pathname === "/readyz" ? readinessResponse(service, checks) : undefined
}

export const respondToHttpRequest = async (options: HttpRequestResponderOptions, request: Request): Promise<Response> => {
  const system = systemResponse(request, options.service, options.readinessChecks)
  if (system !== undefined) {
    return system
  }
  const pathname = new URL(request.url).pathname
  try {
    const response = await options.handleRequest(request)
    options.onCompleted({ method: request.method, pathname, status: response.status })
    return response
  } catch (error) {
    options.onFailed({ error, method: request.method, pathname })
    return Response.json(
      { error: { code: "internal_error", message: "The service could not process the request" } },
      { status: 500 }
    )
  }
}
