/** @module Loopback console HTTP server. */

import { HttpRouteRegistry, HttpServer, jsonError } from "@evergreen-terrace/service-runtime"
import type { ConsoleServerOptions } from "./console-server.types"
import { allowedHosts, guardRequest } from "./request-guard"

export class ConsoleServer extends HttpServer {
  readonly #hosts: Set<string>
  readonly #routes: HttpRouteRegistry

  constructor(options: ConsoleServerOptions) {
    super({ hostname: "127.0.0.1", port: options.port, service: "console" })
    this.#hosts = allowedHosts(options.port)
    this.#routes = new HttpRouteRegistry().register(...options.routes)
  }

  protected async handleRequest(request: Request): Promise<Response> {
    return (
      guardRequest(request, this.#hosts) ??
      (await this.#routes.dispatch(request)) ??
      jsonError(404, "not_found", "Route not found")
    )
  }
}
