/** @module Discovery citation verification tests. */

import { expect, test } from "bun:test"
import { unverifiedCitations } from "./citation-check"

const index = {
  lineCount: async (path: string) => ({ "package.json": 20, "src/a.ts": 3 })[path] ?? null,
  trackedFiles: ["package.json", "src/a.ts"]
}

test("accepts tracked files, lines inside them, and directories; flags the rest", async () => {
  expect(
    await unverifiedCitations(
      [
        { kind: "file", line: 12, path: "package.json" },
        { kind: "file", line: null, path: "./src/a.ts" },
        { kind: "file", line: null, path: "src/" },
        { kind: "file", line: 99, path: "src/a.ts" },
        { kind: "file", line: null, path: "missing.ts" },
        { kind: "file", line: 1, path: "src" },
        { command: "git log -n 1", excerpt: "abc", kind: "command" }
      ],
      index
    )
  ).toEqual(["src/a.ts:99", "missing.ts", "src:1"])
})
