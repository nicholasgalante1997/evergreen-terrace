/** @module Bun.serve listener lifecycle adapter. */

import type { BunHttpListenerOptions } from "./bun-http-listener.types"

export class BunHttpListener {
  #server: ReturnType<typeof Bun.serve> | undefined

  constructor(private readonly options: BunHttpListenerOptions) {}

  get hostname(): string {
    return this.options.hostname
  }

  get port(): number {
    return this.#server?.port ?? this.options.port
  }

  get started(): boolean {
    return this.#server !== undefined
  }

  start(): number {
    if (this.#server !== undefined) {
      throw new Error("HTTP listener is already started")
    }
    const server = Bun.serve(this.options)
    if (server.port === undefined) {
      server.stop(true)
      throw new Error("HTTP listener did not bind a TCP port")
    }
    this.#server = server
    return server.port
  }

  stop(closeActiveConnections: boolean): void {
    this.#server?.stop(closeActiveConnections)
    this.#server = undefined
  }
}
