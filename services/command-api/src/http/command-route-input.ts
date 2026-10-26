/** @module Validated command-route JSON input. */

import { jsonError } from "@evergreen-terrace/service-runtime"

interface BodySchema<Output> {
  safeParse(value: unknown): { data: Output; success: true } | { error: { issues: unknown }; success: false }
}

export const parseCommandBody = async <Output>(
  request: Request,
  schema: BodySchema<Output>,
  invalidCode: string
): Promise<Output | Response> => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(400, "invalid_json", "Request body must be valid JSON")
  }
  const parsed = schema.safeParse(body)
  return parsed.success
    ? parsed.data
    : jsonError(400, invalidCode, "Request body does not match the contract", parsed.error.issues)
}
