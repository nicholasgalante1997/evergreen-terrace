/** @module Required HTTP route-parameter access. */

import type { HttpRouteContext } from "./http-route.types"

export const requiredRouteParam = (params: HttpRouteContext["params"], name: string): string => {
  const value = params[name]
  if (value === undefined) {
    throw new Error(`Matched route is missing required parameter: ${name}`)
  }
  return value
}
