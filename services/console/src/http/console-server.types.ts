/** @module Console server ports. */

import type { HttpRoute } from "@evergreen-terrace/service-runtime"
import type { ConsoleFreshness, ConsoleSnapshot } from "../read-model/read-model.types"

export interface ConsoleRoutePorts {
  assetsDirectory: string
  bridge: { callTool(name: string, argumentsValue: Record<string, unknown>): Promise<unknown> }
  pollIntervalMs: number
  readApi: { freshness(): Promise<ConsoleFreshness | null>; snapshot(): Promise<ConsoleSnapshot> }
}

export interface ConsoleServerOptions {
  port: number
  routes: HttpRoute[]
}
