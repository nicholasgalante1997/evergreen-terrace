/** @module Remote identity normalization tests. */

import { expect, test } from "bun:test"
import { normalizeRemote, withoutCredentials } from "./remote-identity"

const aliases = async (host: string) => ({ "gh-work": "github.com" })[host] ?? host

test.each([
  ["https://github.com/Owner/Repo.git", "github.com/owner/repo"],
  ["https://token:x-oauth@github.com/owner/repo", "github.com/owner/repo"],
  ["git@github.com:owner/repo.git", "github.com/owner/repo"],
  ["git@gh-work:owner/repo.git", "github.com/owner/repo"],
  ["ssh://git@gh-work:22/owner/repo.git", "github.com/owner/repo"],
  ["https://gitlab.com/group/sub/repo.git", null],
  ["/srv/git/repo.git", null]
])("%s identifies %s", async (url, expected) => {
  expect(await normalizeRemote(url, aliases)).toBe(expected)
})

test("strips credentials before a URL is shown or recorded", () => {
  expect(withoutCredentials("https://user:secret@github.com/a/b.git")).toBe("https://github.com/a/b.git")
  expect(withoutCredentials("git@github.com:a/b.git")).toBe("git@github.com:a/b.git")
})
