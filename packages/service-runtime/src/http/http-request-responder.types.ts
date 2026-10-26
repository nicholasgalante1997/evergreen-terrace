/** @module HTTP request-responder contracts. */

import type { ReadinessCheck, RequestCompletedEvent, RequestFailedEvent } from "./http-server.types"

export interface HttpRequestResponderOptions {
  handleRequest(request: Request): Response | Promise<Response>
  onCompleted(event: RequestCompletedEvent): void
  onFailed(event: RequestFailedEvent): void
  readinessChecks: ReadonlyArray<ReadinessCheck>
  service: string
}
