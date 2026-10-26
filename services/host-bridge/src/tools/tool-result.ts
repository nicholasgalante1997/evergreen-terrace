/** @module Standard JSON evidence rendering for MCP tool results. */

import type { McpToolResult } from "@evergreen-terrace/mcp-core"

export const toolResult = <Value extends object>(value: Value): McpToolResult => ({
  content: [{ text: JSON.stringify(value), type: "text" }],
  structuredContent: value as Record<string, unknown>
})
