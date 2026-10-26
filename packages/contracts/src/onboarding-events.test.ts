/** @module Repository-onboarding contract tests. */

import { describe, expect, test } from "bun:test"
import { createOnboardingUpdatedEvent, discoveryReportSchema, onboardingProposalSchema } from "./onboarding-events"

describe("discovery reports", () => {
  test("every finding is cited", () => {
    const finding = {
      area: "validation",
      citations: [{ kind: "file", line: 12, path: "package.json" }],
      claim: "Tests run with bun test.",
      confidence: "high"
    }
    expect(discoveryReportSchema.safeParse({ findings: [finding] }).success).toBe(true)
    expect(discoveryReportSchema.safeParse({ findings: [{ ...finding, citations: [] }] }).success).toBe(false)
    expect(discoveryReportSchema.safeParse({ findings: [] }).success).toBe(false)
    expect(
      discoveryReportSchema.safeParse({ findings: [{ ...finding, citations: [{ kind: "url", url: "https://x" }] }] })
        .success
    ).toBe(false)
  })

  test("a proposal needs at least one validation command and a base ref", () => {
    const proposal = { allowedBaseRefs: ["main"], profile: {}, validation: { commands: ["bun test"] } }
    expect(onboardingProposalSchema.safeParse(proposal).success).toBe(true)
    expect(onboardingProposalSchema.safeParse({ ...proposal, validation: { commands: [] } }).success).toBe(false)
    expect(onboardingProposalSchema.safeParse({ ...proposal, allowedBaseRefs: [] }).success).toBe(false)
  })
})

describe("onboarding.updated", () => {
  const discovery = {
    adapter: "claude" as const,
    baseRef: "main",
    baseSha: "a".repeat(40),
    workers: ["one", "two"].map((key) => ({
      areas: ["topology" as const],
      artifactDirectory: `/tmp/et/${key}`,
      checkoutPath: `/tmp/et/${key}/checkout`,
      key
    }))
  }
  const onboarding = {
    decisionId: null,
    detail: "",
    discovery,
    id: crypto.randomUUID(),
    packet: null,
    projectId: "github.com/example/repository",
    result: null,
    revision: 1,
    revisionOf: null,
    status: "discovering" as const
  }
  const event = {
    actor: { id: "command-api", kind: "system" as const },
    causationId: null,
    correlationId: crypto.randomUUID(),
    sequence: 1
  }

  test("a packet and its decision card exist together, and applied carries a result", () => {
    expect(createOnboardingUpdatedEvent({ ...event, onboarding }).aggregate.type).toBe("onboarding")
    expect(() =>
      createOnboardingUpdatedEvent({ ...event, onboarding: { ...onboarding, decisionId: crypto.randomUUID() } })
    ).toThrow()
    expect(() => createOnboardingUpdatedEvent({ ...event, onboarding: { ...onboarding, status: "applied" } })).toThrow()
  })
})
