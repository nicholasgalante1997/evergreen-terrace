/** @module Learned-preference contract tests: what may promote itself and what needs a card. */

import { describe, expect, test } from "bun:test"
import { preferencePromotionRoute, preferenceProposalSchema } from "./preference-events"

const proposal = (overrides: Record<string, unknown> = {}) => ({
  category: "verbosity",
  evidence: ["event:1", "event:2"],
  idempotencyKey: "pref-1",
  key: "reports.length",
  projectId: null,
  rationale: "The engineer trimmed three long reports.",
  scope: "global",
  value: "short",
  ...overrides
})

describe("preference proposals", () => {
  test("cannot name policy, and must agree with their scope", () => {
    expect(preferenceProposalSchema.safeParse(proposal()).success).toBe(true)
    for (const key of ["policy.x", "permissions.auto", "risk", "validation.commands", "branches.protected"]) {
      expect(preferenceProposalSchema.safeParse(proposal({ key })).success).toBe(false)
    }
    expect(preferenceProposalSchema.safeParse(proposal({ scope: "project" })).success).toBe(false)
    expect(preferenceProposalSchema.safeParse(proposal({ projectId: "github.com/a/b" })).success).toBe(false)
    expect(preferenceProposalSchema.safeParse(proposal({ evidence: ["same", "same"] })).success).toBe(false)
  })
})

describe("promotion route", () => {
  const parsed = preferenceProposalSchema.parse(proposal())

  test("low impact with independent evidence promotes automatically", () => {
    expect(preferencePromotionRoute(parsed, null).route).toBe("automatic")
    expect(preferencePromotionRoute(parsed, { value: "short" }).route).toBe("automatic")
  })

  test("material, contradicting, or thinly evidenced preferences need a decision", () => {
    expect(preferencePromotionRoute({ ...parsed, category: "language_convention" }, null).route).toBe("decision")
    expect(preferencePromotionRoute({ ...parsed, category: "framework_convention" }, null).route).toBe("decision")
    expect(preferencePromotionRoute(parsed, { value: "long" }).route).toBe("decision")
    expect(preferencePromotionRoute({ ...parsed, evidence: ["event:1"] }, null).route).toBe("decision")
  })
})
