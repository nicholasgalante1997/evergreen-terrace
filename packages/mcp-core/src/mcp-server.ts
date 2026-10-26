/** @module Hand-rolled MCP request dispatcher. */

import { EventEmitter } from "node:events"
import { jsonRpcFailure, jsonRpcSuccess, parseJsonRpcRequest } from "./json-rpc"
import type { JsonRpcResponse } from "./json-rpc.types"
import type { McpServerOptions, McpSession } from "./mcp-server.types"

const defaultProtocolVersions = ["2025-06-18", "2025-11-25"]

const protocolVersionFrom = (params: unknown): string | undefined => {
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    return undefined
  }
  const value = (params as Record<string, unknown>).protocolVersion
  return typeof value === "string" ? value : undefined
}

const toolCallFrom = (params: unknown): { argumentsValue: unknown; name: string } | undefined => {
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    return undefined
  }
  const record = params as Record<string, unknown>
  return typeof record.name === "string" ? { argumentsValue: record.arguments ?? {}, name: record.name } : undefined
}

export class McpServer extends EventEmitter {
  readonly #instructions: string | undefined
  readonly #serverInfo
  readonly #supportedProtocolVersions: ReadonlyArray<string>
  readonly #tools

  constructor(options: McpServerOptions) {
    super()
    this.#instructions = options.instructions
    this.#serverInfo = options.serverInfo
    this.#supportedProtocolVersions = options.supportedProtocolVersions ?? defaultProtocolVersions
    this.#tools = options.tools
  }

  createSession(): McpSession {
    return { initialized: false }
  }

  async dispatch(value: unknown, session: McpSession): Promise<JsonRpcResponse | undefined> {
    const request = parseJsonRpcRequest(value)
    if (request === undefined) {
      return jsonRpcFailure(null, -32600, "Invalid Request")
    }

    if (request.method === "notifications/initialized") {
      session.initialized = true
      this.emit("session:initialized", session)
      return undefined
    }

    if (request.id === undefined) {
      return undefined
    }

    if (request.method === "initialize") {
      return this.initialize(request.id, request.params, session)
    }
    if (request.method === "ping") {
      return jsonRpcSuccess(request.id, {})
    }
    if (request.method === "tools/list") {
      return this.listTools(request.id, session)
    }
    if (request.method === "tools/call") {
      return this.callTool(request.id, request.params, session)
    }

    return jsonRpcFailure(request.id, -32601, `Method not found: ${request.method}`)
  }

  private initialize(
    id: Exclude<NonNullable<ReturnType<typeof parseJsonRpcRequest>>["id"], undefined>,
    params: unknown,
    session: McpSession
  ): JsonRpcResponse {
    const requestedVersion = protocolVersionFrom(params)
    const protocolVersion =
      requestedVersion !== undefined && this.#supportedProtocolVersions.includes(requestedVersion)
        ? requestedVersion
        : this.#supportedProtocolVersions[0]
    if (protocolVersion === undefined) {
      return jsonRpcFailure(id, -32603, "MCP server has no supported protocol version")
    }

    session.protocolVersion = protocolVersion
    session.initialized = true
    this.emit("session:initialized", session)
    return jsonRpcSuccess(id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: this.#serverInfo,
      ...(this.#instructions === undefined ? {} : { instructions: this.#instructions })
    })
  }

  private listTools(
    id: Exclude<NonNullable<ReturnType<typeof parseJsonRpcRequest>>["id"], undefined>,
    session: McpSession
  ): JsonRpcResponse {
    if (!session.initialized) {
      return jsonRpcFailure(id, -32002, "Server not initialized")
    }
    return jsonRpcSuccess(id, { tools: this.#tools.list() })
  }

  private async callTool(
    id: Exclude<NonNullable<ReturnType<typeof parseJsonRpcRequest>>["id"], undefined>,
    params: unknown,
    session: McpSession
  ): Promise<JsonRpcResponse> {
    if (!session.initialized) {
      return jsonRpcFailure(id, -32002, "Server not initialized")
    }
    const toolCall = toolCallFrom(params)
    if (toolCall === undefined) {
      return jsonRpcFailure(id, -32602, "tools/call requires a tool name")
    }
    const tool = this.#tools.get(toolCall.name)
    if (tool === undefined) {
      return jsonRpcSuccess(id, { content: [{ type: "text", text: `Unknown tool: ${toolCall.name}` }], isError: true })
    }

    try {
      const result = await tool.invoke(toolCall.argumentsValue)
      this.emit("tool:called", { name: toolCall.name, result })
      return jsonRpcSuccess(id, result)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool invocation failed"
      this.emit("tool:failed", { error, name: toolCall.name })
      return jsonRpcSuccess(id, { content: [{ type: "text", text: message }], isError: true })
    }
  }
}
