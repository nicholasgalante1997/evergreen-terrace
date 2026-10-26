/** @module Outbox serialization tests. */

import { expect, test } from "bun:test"
import { z } from "zod"
import { parseJsonColumn } from "./serialization"

test("Postgres JSONB strings are decoded before event validation", () => {
  const jsonColumn = z.preprocess(parseJsonColumn, z.object({ eventId: z.string().uuid() }))

  expect(jsonColumn.parse(JSON.stringify({ eventId: crypto.randomUUID() }))).toHaveProperty("eventId")
})
