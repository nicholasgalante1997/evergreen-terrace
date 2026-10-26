/** @module Bounded MCP HTTP JSON payload parsing. */

import { jsonError } from "@evergreen-terrace/service-runtime"

export const mcpSessionHeader = "mcp-session-id"

const maxBodyBytes = 4 * 1024 * 1024

export const parseMcpHttpPayload = async (request: Request): Promise<Response | unknown> => {
  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (!Number.isFinite(contentLength) || contentLength > maxBodyBytes) {
    return jsonError(413, "payload_too_large", "MCP requests are limited to 4 MiB")
  }
  try {
    const body = await request.text()
    if (Buffer.byteLength(body) > maxBodyBytes) {
      return jsonError(413, "payload_too_large", "MCP requests are limited to 4 MiB")
    }
    return JSON.parse(body) as unknown
  } catch {
    return Response.json({ error: { code: -32700, message: "Parse error" }, id: null, jsonrpc: "2.0" }, { status: 400 })
  }
}

export const isMcpInitialize = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (value as Record<string, unknown>).method === "initialize"
