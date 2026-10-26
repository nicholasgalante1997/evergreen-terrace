/** @module HTTP route-registry contracts. */

export interface HttpRouteContext {
  params: Readonly<Record<string, string>>
  request: Request
  url: URL
}

export interface HttpRoute {
  handle(context: HttpRouteContext): Response | Promise<Response>
  method: string
  name: string
  path: string
}

export interface CompiledHttpPath {
  matcher: RegExp
  parameterNames: readonly string[]
}
