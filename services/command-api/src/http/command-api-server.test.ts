/** @module Command API route-registry integration tests. */

import { expect, test } from "bun:test"
import type { CommandDatabase } from "../persistence/command-database"
import { CommandApiServer } from "./command-api-server"

const decisionId = "8c14e53d-768e-48a7-8e93-088f457b9d59"

test("dispatches query and parameterized mutation routes through registered modules", async () => {
  let projectId: string | null = null
  let resolved: { id: string; selected: string | null } | undefined
  const database = {
    check: async (): Promise<void> => undefined,
    listGoals: async (input: string | null) => {
      projectId = input
      return [{ id: "goal-1" }]
    },
    resolveDecision: async (id: string, input: { selectedOptionId: string | null }) => {
      resolved = { id, selected: input.selectedOptionId }
      return { decisionId: id, eventId: crypto.randomUUID(), resolved: true, status: "approved" }
    }
  } as unknown as CommandDatabase
  const server = new CommandApiServer({ database, port: 0 })

  const goals = await server.respond(new Request("http://command/v1/goals?projectId=github.com/example/repository"))
  const decision = await server.respond(
    new Request(`http://command/v1/decisions/${decisionId}/resolve`, {
      body: JSON.stringify({ note: "Reviewed.", selectedOptionId: "allow", status: "approved" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    })
  )

  expect(await goals.json()).toEqual({ goals: [{ id: "goal-1" }] })
  expect(String(projectId)).toBe("github.com/example/repository")
  expect(decision.status).toBe(200)
  expect(resolved).toEqual({ id: decisionId, selected: "allow" })
  expect((await server.respond(new Request("http://command/v1/unknown"))).status).toBe(404)
})
