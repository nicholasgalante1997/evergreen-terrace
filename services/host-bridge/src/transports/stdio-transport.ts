/** @module Newline-delimited JSON-RPC stdio MCP transport. */

import { createInterface } from "node:readline"
import type { McpServer } from "@evergreen-terrace/mcp-core"

const maxLineBytes = 4 * 1024 * 1024

const writeResponse = (response: unknown): void => {
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

export const serveStdio = async (server: McpServer): Promise<void> => {
  const session = server.createSession()
  const input = createInterface({ crlfDelay: Infinity, input: process.stdin, terminal: false })
  for await (const line of input) {
    if (Buffer.byteLength(line) > maxLineBytes) {
      writeResponse({ error: { code: -32600, message: "JSON-RPC frame exceeds 4 MiB" }, id: null, jsonrpc: "2.0" })
      continue
    }
    let request: unknown
    try {
      request = JSON.parse(line)
    } catch {
      writeResponse({ error: { code: -32700, message: "Parse error" }, id: null, jsonrpc: "2.0" })
      continue
    }
    const response = await server.dispatch(request, session)
    if (response !== undefined) {
      writeResponse(response)
    }
  }
}
