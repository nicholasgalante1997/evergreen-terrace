/** @module Host verification of discovery citations against the base commit. */

import type { DiscoveryCitation } from "@evergreen-terrace/contracts"

export interface CitationIndex {
  /** Line count of a tracked file at the base, or null when it is not a tracked file. */
  lineCount(path: string): Promise<number | null>
  trackedFiles: readonly string[]
}

const normalized = (path: string): string => path.replace(/^\.\//, "").replace(/\/+$/, "")

/**
 * A file citation holds when it names a tracked file (and, with a line, a line
 * inside it) or a directory containing tracked files. Command citations cannot
 * be checked after the fact and are kept as reported.
 */
export const unverifiedCitation = async (citation: DiscoveryCitation, index: CitationIndex): Promise<string | null> => {
  if (citation.kind === "command") {
    return null
  }
  const path = normalized(citation.path)
  const label = `${citation.path}${citation.line === null ? "" : `:${citation.line}`}`
  if (index.trackedFiles.includes(path)) {
    if (citation.line === null) {
      return null
    }
    const lines = await index.lineCount(path)
    return lines !== null && citation.line <= lines ? null : label
  }
  const directory = index.trackedFiles.some((tracked) => tracked.startsWith(`${path}/`))
  return directory && citation.line === null ? null : label
}

export const unverifiedCitations = async (
  citations: readonly DiscoveryCitation[],
  index: CitationIndex
): Promise<string[]> => {
  const results = await Promise.all(citations.map((citation) => unverifiedCitation(citation, index)))
  return results.filter((label): label is string => label !== null)
}
