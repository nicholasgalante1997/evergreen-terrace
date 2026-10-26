/** @module Pure scope-claim matching: which files a planned worker may change, and where two claims meet. */

/**
 * A claim pattern is a repository-relative glob. A pattern ending in `/`
 * claims everything under that directory, and a plain directory name claims
 * its contents too, so `src/api` and `src/api/` both mean `src/api/**`.
 */
const globs = new Map<string, Bun.Glob>()

const glob = (pattern: string): Bun.Glob => {
  let compiled = globs.get(pattern)
  if (compiled === undefined) {
    compiled = new Bun.Glob(pattern)
    globs.set(pattern, compiled)
  }
  return compiled
}

const hasGlobSyntax = (pattern: string): boolean => /[*?[\]{}]/.test(pattern)

export const matchesClaim = (path: string, pattern: string): boolean => {
  if (pattern.endsWith("/")) {
    return path.startsWith(pattern)
  }
  if (!hasGlobSyntax(pattern)) {
    return path === pattern || path.startsWith(`${pattern}/`)
  }
  return glob(pattern).match(path)
}

export const withinClaim = (path: string, patterns: readonly string[]): boolean =>
  patterns.some((pattern) => matchesClaim(path, pattern))

/** Changed files the claim does not cover, sorted for stable evidence. */
export const outsideClaim = (paths: readonly string[], patterns: readonly string[]): string[] =>
  [...new Set(paths.filter((path) => !withinClaim(path, patterns)))].sort((left, right) => left.localeCompare(right))

/** The literal directory a pattern starts in, before any glob syntax. */
const literalPrefix = (pattern: string): string => {
  const index = pattern.search(/[*?[\]{}]/)
  const literal = index === -1 ? pattern : pattern.slice(0, index)
  return literal.slice(0, literal.lastIndexOf("/") + 1)
}

/**
 * Files both claims cover. Existing files are matched exactly. A pattern that
 * matches nothing yet (new files) overlaps another when one's literal
 * directory contains the other's, reported as `pattern ~ pattern`.
 */
export const claimOverlap = (
  trackedFiles: readonly string[],
  left: readonly string[],
  right: readonly string[]
): string[] => {
  const shared = trackedFiles.filter((path) => withinClaim(path, left) && withinClaim(path, right))
  const unmatched = (patterns: readonly string[]) =>
    patterns.filter((pattern) => !trackedFiles.some((path) => matchesClaim(path, pattern)))
  const prospective = unmatched(left).flatMap((leftPattern) =>
    unmatched(right)
      .filter((rightPattern) => {
        const [a, b] = [literalPrefix(leftPattern), literalPrefix(rightPattern)]
        return leftPattern === rightPattern || (a.length > 0 && b.length > 0 && (a.startsWith(b) || b.startsWith(a)))
      })
      .map((rightPattern) => (leftPattern === rightPattern ? leftPattern : `${leftPattern} ~ ${rightPattern}`))
  )
  return [...new Set([...shared, ...prospective])].sort((a, b) => a.localeCompare(b))
}
