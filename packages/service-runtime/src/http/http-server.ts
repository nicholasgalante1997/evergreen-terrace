/** @module Event-emitting Bun HTTP server base class. */

import { EventEmitter } from "node:events"
import { BunHttpListener } from "./bun-http-listener"
import type { HttpServerOptions, ReadinessCheck, ServerStartedEvent } from "./http-server.types"
import { respondToHttpRequest } from "./http-request-responder"

/** Lifecycle owner around Bun.serve; subclasses own only domain routing. */
export abstract class HttpServer extends EventEmitter {
  readonly #listener: BunHttpListener
  readonly #readinessChecks: ReadonlyArray<ReadinessCheck>
  readonly #service: string

  protected constructor(options: HttpServerOptions) {
    super()
    this.#readinessChecks = options.readinessChecks ?? []
    this.#service = options.service
    this.#listener = new BunHttpListener({
      fetch: (request) => this.respond(request),
      hostname: options.hostname ?? "0.0.0.0",
      port: options.port
    })
  }

  get hostname(): string {
    return this.#listener.hostname
  }

  get port(): number {
    return this.#listener.port
  }

  get service(): string {
    return this.#service
  }

  get started(): boolean {
    return this.#listener.started
  }

  start(): this {
    if (this.#listener.started) {
      throw new Error(`${this.#service} is already started`)
    }
    const boundPort = this.#listener.start()
    this.emit("server:started", {
      hostname: this.#listener.hostname,
      port: boundPort,
      service: this.#service
    } satisfies ServerStartedEvent)
    return this
  }

  stop(closeActiveConnections = false): void {
    if (!this.#listener.started) {
      return
    }
    this.#listener.stop(closeActiveConnections)
    this.emit("server:stopped", { service: this.#service })
  }

  protected abstract handleRequest(request: Request): Response | Promise<Response>

  /** Public for transport-independent tests and future alternate adapters. */
  async respond(request: Request): Promise<Response> {
    return respondToHttpRequest(
      {
        handleRequest: (domainRequest) => this.handleRequest(domainRequest),
        onCompleted: (event) => this.emit("request:completed", event),
        onFailed: (event) => this.emit("request:failed", event),
        readinessChecks: this.#readinessChecks,
        service: this.#service
      },
      request
    )
  }
}
