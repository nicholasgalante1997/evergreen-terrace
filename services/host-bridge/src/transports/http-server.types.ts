/** @module HTTP MCP transport construction contracts. */

import type { McpServer } from "@evergreen-terrace/mcp-core"

export interface McpHttpServerOptions {
  mcp: McpServer
  port: number
}

