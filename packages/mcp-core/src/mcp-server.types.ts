/** @module MCP server/session construction contracts. */

import type { McpToolRegistry } from "./mcp-tool-registry"

export interface McpServerInfo {
  name: string
  version: string
}

export interface McpServerOptions {
  instructions?: string
  serverInfo: McpServerInfo
  supportedProtocolVersions?: ReadonlyArray<string>
  tools: McpToolRegistry
}

export interface McpSession {
  initialized: boolean
  protocolVersion?: string
}
