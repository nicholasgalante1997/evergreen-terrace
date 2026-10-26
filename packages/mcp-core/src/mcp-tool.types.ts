/** @module MCP tool plugin contracts. */

export interface McpToolDefinition {
  description: string
  inputSchema: Record<string, unknown>
  name: string
}

export interface McpToolResult {
  content: ReadonlyArray<{ text: string; type: "text" }>
  isError?: boolean
  structuredContent?: Record<string, unknown>
}

export interface McpTool {
  readonly definition: McpToolDefinition
  invoke(argumentsValue: unknown): Promise<McpToolResult>
}
