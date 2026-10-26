/** @module MCP JSON-RPC HTTP error responses. */

export const mcpHttpError = (status: number, code: number, message: string): Response =>
  Response.json({ error: { code, message }, id: null, jsonrpc: "2.0" }, { status })
