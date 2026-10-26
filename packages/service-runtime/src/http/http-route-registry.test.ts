/** @module HTTP route-registry tests. */

import { expect, test } from "bun:test"
import { HttpRouteRegistry } from "./http-route-registry"

test("dispatches a named path parameter to the matching handler", async () => {
  const routes = new HttpRouteRegistry().register({
    handle: ({ params, url }) => Response.json({ decisionId: params.decisionId, projectId: url.searchParams.get("projectId") }),
    method: "GET",
    name: "decisions.get",
    path: "/v1/decisions/:decisionId"
  })

  const response = await routes.dispatch(
    new Request("http://factory/v1/decisions/93a616b1-cc49-4053-96b5-5f4eb7b43478?projectId=example")
  )

  expect(response?.status).toBe(200)
  expect(await response?.json()).toEqual({
    decisionId: "93a616b1-cc49-4053-96b5-5f4eb7b43478",
    projectId: "example"
  })
})

test("returns no response for an unmatched route and rejects duplicate registrations", async () => {
  const route = {
    handle: () => Response.json({ ok: true }),
    method: "GET",
    name: "goals.list",
    path: "/v1/goals"
  }
  const routes = new HttpRouteRegistry().register(route)

  expect(await routes.dispatch(new Request("http://factory/v1/goals", { method: "POST" }))).toBeUndefined()
  expect(() => routes.register(route)).toThrow("HTTP route is already registered")
})
