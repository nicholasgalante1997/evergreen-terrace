/** @module Bun HTTP listener construction contracts. */

export interface BunHttpListenerOptions {
  fetch(request: Request): Response | Promise<Response>
  hostname: string
  port: number
}
