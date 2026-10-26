/** @module Loopback request guard: DNS-rebinding and cross-site protection for the console. */

import { jsonError } from "@evergreen-terrace/service-runtime"

/** Header the console's own page sends on every action; a cross-site form cannot set it. */
export const consoleActionHeader = "x-evergreen-console"

/**
 * Every request must name an allowed Host (defeats DNS rebinding). A request
 * that changes anything must also come from the console's own origin, carry
 * JSON, and carry the console action header (defeats cross-site requests).
 */
export const guardRequest = (request: Request, allowedHosts: ReadonlySet<string>): Response | null => {
  const host = request.headers.get("host") ?? ""
  if (!allowedHosts.has(host)) {
    return jsonError(421, "host_not_allowed", "The console only answers on its loopback address")
  }
  if (request.method === "GET" || request.method === "HEAD") {
    return null
  }
  const origin = request.headers.get("origin")
  if (origin !== `http://${host}`) {
    return jsonError(403, "cross_origin_action", "Console actions must come from the console itself")
  }
  if (
    request.headers.get(consoleActionHeader) !== "1" ||
    !(request.headers.get("content-type") ?? "").startsWith("application/json")
  ) {
    return jsonError(403, "unmarked_action", "Console actions must be JSON and carry the console action header")
  }
  return null
}

export const allowedHosts = (port: number): Set<string> => new Set([`127.0.0.1:${port}`, `localhost:${port}`])
