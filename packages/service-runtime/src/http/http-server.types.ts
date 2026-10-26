/** @module HTTP server lifecycle contracts. */

export interface ReadinessCheck {
  name: string
  check(): Promise<void>
}

export interface HttpServerOptions {
  service: string
  port: number
  hostname?: string
  readinessChecks?: ReadonlyArray<ReadinessCheck>
}

export interface RequestCompletedEvent {
  method: string
  pathname: string
  status: number
}

export interface RequestFailedEvent {
  error: unknown
  method: string
  pathname: string
}

export interface ServerStartedEvent {
  hostname: string
  port: number
  service: string
}
