/** @module JSON-RPC validation and response constructors. */

import type { JsonRpcFailure, JsonRpcId, JsonRpcRequest, JsonRpcSuccess } from "./json-rpc.types"

const isJsonRpcId = (value: unknown): value is JsonRpcId =>
  value === null || typeof value === "number" || typeof value === "string"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const parseJsonRpcRequest = (value: unknown): JsonRpcRequest | undefined => {
  if (!isRecord(value) || value.jsonrpc !== "2.0" || typeof value.method !== "string") {
    return undefined
  }
  if ("id" in value && !isJsonRpcId(value.id)) {
    return undefined
  }

  const request: JsonRpcRequest = { jsonrpc: "2.0", method: value.method }
  if ("id" in value) {
    request.id = value.id as JsonRpcId
  }
  if ("params" in value) {
    request.params = value.params
  }
  return request
}

export const jsonRpcSuccess = (id: JsonRpcId, result: unknown): JsonRpcSuccess => ({ id, jsonrpc: "2.0", result })

export const jsonRpcFailure = (id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcFailure => ({
  error: { code, message, ...(data === undefined ? {} : { data }) },
  id,
  jsonrpc: "2.0"
})
