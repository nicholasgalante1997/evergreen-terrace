/** @module Event-emitting registry for first-party MCP tool plugins. */

import { EventEmitter } from "node:events"
import type { McpTool, McpToolDefinition } from "./mcp-tool.types"

export class McpToolRegistry extends EventEmitter {
  readonly #tools = new Map<string, McpTool>()

  register(tool: McpTool): this {
    if (this.#tools.has(tool.definition.name)) {
      throw new Error(`MCP tool is already registered: ${tool.definition.name}`)
    }
    this.#tools.set(tool.definition.name, tool)
    this.emit("tool:registered", tool.definition)
    return this
  }

  get(name: string): McpTool | undefined {
    return this.#tools.get(name)
  }

  list(): McpToolDefinition[] {
    return [...this.#tools.values()].map((tool) => tool.definition)
  }
}
