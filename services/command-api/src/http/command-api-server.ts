/** @module Command API HTTP-server composition root. */

import { HttpRouteRegistry, HttpServer, jsonError } from "@evergreen-terrace/service-runtime"
import type { CommandApiServerOptions } from "./command-api-server.types"
import { decisionCommandRoutes } from "./decision-command-routes"
import { decisionQueryRoutes } from "./decision-query-routes"
import { evidenceRoutes } from "./evidence-routes"
import { goalRoutes } from "./goal-routes"
import { handoffRoutes } from "./handoff-routes"
import { workerCommandRoutes } from "./worker-command-routes"
import { workerQueryRoutes } from "./worker-query-routes"
import { workerSchedulingRoutes } from "./worker-scheduling-routes"

export class CommandApiServer extends HttpServer {
  readonly #routes: HttpRouteRegistry

  constructor(options: CommandApiServerOptions) {
    super({
      service: "command-api",
      port: options.port,
      readinessChecks: [{ name: "command-database", check: () => options.database.check() }]
    })
    this.#routes = new HttpRouteRegistry().register(
      ...goalRoutes(options.database),
      ...decisionCommandRoutes(options.database),
      ...decisionQueryRoutes(options.database),
      ...workerCommandRoutes(options.database),
      ...workerQueryRoutes(options.database),
      ...workerSchedulingRoutes(options.database),
      ...evidenceRoutes(options.database),
      ...handoffRoutes(options.database)
    )
  }

  protected async handleRequest(request: Request): Promise<Response> {
    return (await this.#routes.dispatch(request)) ?? jsonError(404, "not_found", "Route not found")
  }
}
