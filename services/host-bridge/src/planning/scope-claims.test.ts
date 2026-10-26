/** @module Scope-claim matching and overlap tests. */

import { describe, expect, test } from "bun:test"
import { claimOverlap, matchesClaim, outsideClaim } from "./scope-claims"

describe("scope claims", () => {
  test.each([
    ["src/api/route.ts", "src/api/**", true],
    ["src/api/deep/route.ts", "src/api/", true],
    ["src/api/route.ts", "src/api", true],
    ["src/apiary/x.ts", "src/api", false],
    ["README.md", "README.md", true],
    ["docs/README.md", "README.md", false],
    ["packages/a/src/index.ts", "packages/*/src/index.ts", true],
    ["src/ui/page.tsx", "src/api/**", false]
  ])("%s within %s is %p", (path, pattern, expected) => {
    expect(matchesClaim(path, pattern)).toBe(expected)
  })

  test("reports changed files outside the claim, sorted and unique", () => {
    expect(outsideClaim(["z.ts", "src/api/a.ts", "a.ts", "a.ts"], ["src/api/**"])).toEqual(["a.ts", "z.ts"])
  })

  test("finds existing files two claims share, and prospective overlap for new files", () => {
    const tracked = ["src/api/a.ts", "src/api/b.ts", "src/ui/page.tsx", "README.md"]
    expect(claimOverlap(tracked, ["src/api/**"], ["src/api/b.ts", "README.md"])).toEqual(["src/api/b.ts"])
    expect(claimOverlap(tracked, ["src/api/**"], ["src/ui/**"])).toEqual([])
    expect(claimOverlap(tracked, ["src/new/**"], ["src/new/x/*.ts"])).toEqual(["src/new/** ~ src/new/x/*.ts"])
    expect(claimOverlap(tracked, ["src/new/**"], ["src/other/**"])).toEqual([])
  })
})
