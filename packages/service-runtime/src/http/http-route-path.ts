/** @module Named HTTP path-template compiler. */

import type { CompiledHttpPath } from "./http-route.types"

const parameterName = /^:([a-z][a-z0-9_]*)$/i

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const compileHttpPath = (path: string): CompiledHttpPath => {
  if (!path.startsWith("/")) {
    throw new Error(`Route path must start with '/': ${path}`)
  }
  const parameterNames: string[] = []
  const source = path
    .split("/")
    .map((segment) => {
      const parameter = parameterName.exec(segment)
      if (parameter?.[1] !== undefined) {
        parameterNames.push(parameter[1])
        return "([^/]+)"
      }
      return escape(segment)
    })
    .join("/")
  if (new Set(parameterNames).size !== parameterNames.length) {
    throw new Error(`Route path cannot repeat a parameter name: ${path}`)
  }
  return { matcher: new RegExp(`^${source}$`), parameterNames }
}
