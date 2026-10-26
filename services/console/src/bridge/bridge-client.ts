/** @module Server-side MCP client for the host bridge; the browser never talks to the bridge. */

const sessionHeader = "mcp-session-id"

export class BridgeToolError extends Error {
  constructor(
    message: string,
    readonly tool: string
  ) {
    super(message)
    this.name = "BridgeToolError"
  }
}

/**
 * Opens one MCP session per call. Console actions are rare and explicit, so
 * a short-lived session is simpler than keeping one alive across bridge restarts.
 */
export class BridgeClient {
  constructor(
    private readonly endpoint: string,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async callTool(name: string, argumentsValue: Record<string, unknown>): Promise<unknown> {
    const initialized = await this.post({
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "evergreen-console", version: "0.1.0" },
        protocolVersion: "2025-06-18"
      }
    })
    const session = initialized.headers.get(sessionHeader)
    if (!initialized.ok || session === null) {
      throw new BridgeToolError(`The host bridge refused the MCP session (${initialized.status})`, name)
    }
    try {
      await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, session)
      const response = await this.post(
        { id: 2, jsonrpc: "2.0", method: "tools/call", params: { arguments: argumentsValue, name } },
        session
      )
      const payload = (await response.json()) as {
        error?: { message?: string }
        result?: { content?: Array<{ text?: string }>; isError?: boolean; structuredContent?: unknown }
      }
      if (payload.error !== undefined) {
        throw new BridgeToolError(payload.error.message ?? "MCP error", name)
      }
      const text = payload.result?.content?.[0]?.text ?? ""
      if (payload.result?.isError === true) {
        throw new BridgeToolError(text.slice(0, 2_000), name)
      }
      return payload.result?.structuredContent ?? text
    } finally {
      await this.fetcher(this.endpoint, { headers: { [sessionHeader]: session }, method: "DELETE" }).catch(
        () => undefined
      )
    }
  }

  private post(body: unknown, session?: string): Promise<Response> {
    return this.fetcher(this.endpoint, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", ...(session === undefined ? {} : { [sessionHeader]: session }) },
      method: "POST"
    })
  }
}
