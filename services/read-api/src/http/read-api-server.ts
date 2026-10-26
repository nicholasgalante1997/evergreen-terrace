/** @module Read API HTTP-server composition root. */

import { HttpRouteRegistry, HttpServer, jsonError } from "@evergreen-terrace/service-runtime"
import type { ReadApiServerOptions } from "./read-api-server.types"
import { readApiRoutes } from "./read-api-routes"

export class ReadApiServer extends HttpServer {
  readonly #routes: HttpRouteRegistry

  constructor(options: ReadApiServerOptions) {
    super({
      service: "read-api",
      port: options.port,
      readinessChecks: [{ name: "read-database", check: () => options.database.check() }]
    })
    this.#routes = new HttpRouteRegistry().register(...readApiRoutes(options.database))
  }

  protected async handleRequest(request: Request): Promise<Response> {
    return (await this.#routes.dispatch(request)) ?? jsonError(404, "not_found", "Route not found")
  }
}
