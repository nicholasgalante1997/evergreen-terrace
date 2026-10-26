/** @module HTTP server lifecycle tests. */

import { expect, test } from "bun:test"
import { HttpServer } from "./http-server"

class TestServer extends HttpServer {
  constructor() {
    super({
      service: "test-server",
      port: 0,
      hostname: "127.0.0.1",
      readinessChecks: [{ name: "always-ready", check: async (): Promise<void> => undefined }]
    })
  }

  protected handleRequest(): Response {
    return Response.json({ ok: true })
  }
}

class UnreadyServer extends HttpServer {
  constructor() {
    super({
      service: "unready-server",
      port: 7410,
      readinessChecks: [{ name: "dependency", check: async (): Promise<void> => Promise.reject(new Error("offline")) }]
    })
  }

  protected handleRequest(): Response {
    throw new Error("unexpected handler failure")
  }
}

test("HttpServer owns transport-independent health, readiness, and request dispatch", async () => {
  const server = new TestServer()
  expect((await server.respond(new Request("http://test/healthz"))).status).toBe(200)
  expect((await server.respond(new Request("http://test/readyz"))).status).toBe(200)
  expect((await server.respond(new Request("http://test/domain"))).status).toBe(200)
})

test("HttpServer reports readiness failures and converts handler failures into a safe response", async () => {
  const server = new UnreadyServer()
  const failures: unknown[] = []
  server.on("request:failed", (event) => failures.push(event))

  const readiness = await server.respond(new Request("http://test/readyz"))
  expect(readiness.status).toBe(503)
  expect(await readiness.json()).toEqual({
    service: "unready-server",
    status: "not_ready",
    failedChecks: ["dependency"]
  })

  const failure = await server.respond(new Request("http://test/domain"))
  expect(failure.status).toBe(500)
  expect(failures).toHaveLength(1)
})
