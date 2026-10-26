/** @module Console composition root: a loopback server over the read API, acting through the host bridge. */

import { existsSync } from "node:fs"
import { join } from "node:path"
import { readPort } from "@evergreen-terrace/service-runtime"
import { BridgeClient } from "./bridge/bridge-client"
import { consoleRoutes } from "./http/console-routes"
import { ConsoleServer } from "./http/console-server"
import { ReadApiClient } from "./read-model/read-api-client"

const setting = (name: string): string | undefined => {
  const value = process.env[name]?.trim()
  return value === undefined || value.length === 0 ? undefined : value
}

/** Run from the repository root (`bun run console`) or from this package. */
const assetsDirectory =
  setting("ET_CONSOLE_ASSETS") ??
  [join(process.cwd(), "services", "console", "dist", "assets"), join(process.cwd(), "dist", "assets")].find((path) =>
    existsSync(path)
  ) ??
  join(process.cwd(), "dist", "assets")

const server = new ConsoleServer({
  port: readPort(process.env["PORT"], 7460),
  routes: consoleRoutes({
    assetsDirectory,
    bridge: new BridgeClient(setting("ET_HOST_BRIDGE_URL") ?? "http://127.0.0.1:7450/mcp"),
    pollIntervalMs: 2_000,
    readApi: new ReadApiClient(setting("ET_READ_API_URL") ?? "http://127.0.0.1:7440")
  })
})
server.on("request:failed", (event: { error: unknown; pathname: string }) =>
  console.error(
    JSON.stringify({
      error: event.error instanceof Error ? event.error.message : String(event.error),
      event: "console.request_failed",
      pathname: event.pathname
    })
  )
)
server.start()
console.error(JSON.stringify({ assetsDirectory, event: "console.started", url: `http://127.0.0.1:${server.port}/` }))

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => server.stop())
}
