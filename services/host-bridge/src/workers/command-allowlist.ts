/** @module Conservative read-only command allowlist, confined to one worktree. */

import { realpathSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"

/** Read-only programs and the flags that would make each one write, execute, or exfiltrate. */
const readOnlyPrograms: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["cat", new Set<string>()],
  ["cut", new Set<string>()],
  ["diff", new Set<string>()],
  ["du", new Set<string>()],
  ["file", new Set<string>()],
  ["find", new Set(["-delete", "-exec", "-execdir", "-fls", "-fprint", "-fprint0", "-fprintf", "-ok", "-okdir"])],
  ["grep", new Set<string>()],
  ["head", new Set<string>()],
  ["ls", new Set<string>()],
  ["pwd", new Set<string>()],
  ["rg", new Set(["--pre", "--pre-glob", "--search-zip", "-z"])],
  ["sort", new Set(["-o", "--output", "--compress-program"])],
  ["stat", new Set<string>()],
  ["tail", new Set(["-f", "-F", "--follow"])],
  ["tree", new Set(["-o"])],
  ["wc", new Set<string>()]
])

const readOnlyGitSubcommands = new Set(["blame", "branch", "diff", "log", "ls-files", "rev-parse", "show", "status"])

/** Git options that write files or run configured external programs. */
const unsafeGitOption = /^--(output|ext-diff|textconv|exec|upload-pack|receive-pack|open-files-in-pager)(=|$)/

const safeBranchArguments = new Set(["--show-current", "--list", "-a", "-r", "-v", "-vv", "--all", "--remotes"])

const insideWorktree = (worktreePath: string, candidate: string): boolean => {
  const root = resolve(worktreePath)
  const resolved = resolve(root, candidate)
  let real = resolved
  try {
    real = realpathSync(resolved)
  } catch {
    // A path that does not exist cannot be read; its lexical location is what matters.
  }
  return [resolved, real].every((path) => {
    const inside = relative(root, path)
    return inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))
  })
}

/**
 * Every non-flag word, and every `--flag=value` value, is treated as a possible
 * path and must resolve inside the worktree (following symlinks). A grep
 * pattern that looks like an outside path is refused too: a card is the safe
 * outcome of doubt.
 */
const argumentsConfined = (words: readonly string[], worktreePath: string): boolean =>
  words.every((word) => {
    if (word.startsWith("~")) {
      return false
    }
    const value = word.startsWith("-") ? (word.includes("=") ? word.slice(word.indexOf("=") + 1) : "") : word
    return value.length === 0 || insideWorktree(worktreePath, value)
  })

/**
 * Long flags match with or without `=value`. A short denied flag (`-o`) also
 * matches when clustered (`-nf`) or attached to its value (`-ofile`).
 */
const usesDeniedFlag = (word: string, denied: ReadonlySet<string>): boolean => {
  if (word.startsWith("--")) {
    return denied.has(word.includes("=") ? word.slice(0, word.indexOf("=")) : word)
  }
  if (!word.startsWith("-") || word.length < 2) {
    return false
  }
  if (denied.has(word)) {
    return true
  }
  const cluster = /^-([A-Za-z]+)/.exec(word)?.[1] ?? ""
  return [...denied].some((flag) => /^-[A-Za-z]$/.test(flag) && cluster.includes(flag.slice(1)))
}

/** Returns the matched rule name, or null when the command needs an engineer decision. */
export const readOnlyRule = (argv: readonly string[], worktreePath: string): string | null => {
  const [program, ...rest] = argv
  if (program === undefined || program.includes("/")) {
    return null
  }
  if (program === "git") {
    const [subcommand, ...gitArguments] = rest
    if (subcommand === undefined || !readOnlyGitSubcommands.has(subcommand)) {
      return null
    }
    if (gitArguments.some((word) => unsafeGitOption.test(word))) {
      return null
    }
    if (subcommand === "branch" && gitArguments.some((word) => !safeBranchArguments.has(word))) {
      return null
    }
    return argumentsConfined(gitArguments, worktreePath) ? `read_only:git-${subcommand}` : null
  }
  const deniedFlags = readOnlyPrograms.get(program)
  if (deniedFlags === undefined) {
    return null
  }
  if (rest.some((word) => usesDeniedFlag(word, deniedFlags))) {
    return null
  }
  return argumentsConfined(rest, worktreePath) ? `read_only:${program}` : null
}
