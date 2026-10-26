/** @module Deterministic HTTP route registry. */

import { compileHttpPath } from "./http-route-path"
import type { HttpRoute, HttpRouteContext } from "./http-route.types"

interface RegisteredHttpRoute {
  matcher: RegExp
  parameterNames: readonly string[]
  route: HttpRoute
}

export class HttpRouteRegistry {
  readonly #routes: RegisteredHttpRoute[] = []

  register(...routes: readonly HttpRoute[]): this {
    for (const route of routes) {
      if (this.#routes.some((entry) => entry.route.method === route.method && entry.route.path === route.path)) {
        throw new Error(`HTTP route is already registered: ${route.method} ${route.path}`)
      }
      const compiled = compileHttpPath(route.path)
      this.#routes.push({ ...compiled, route })
    }
    return this
  }

  async dispatch(request: Request): Promise<Response | undefined> {
    const url = new URL(request.url)
    for (const entry of this.#routes) {
      const match = entry.route.method === request.method ? entry.matcher.exec(url.pathname) : null
      if (match !== null) {
        return entry.route.handle(this.context(request, url, entry.parameterNames, match))
      }
    }
    return undefined
  }

  private context(request: Request, url: URL, names: readonly string[], match: RegExpExecArray): HttpRouteContext {
    const params = Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1] ?? "")]))
    return { params, request, url }
  }
}
