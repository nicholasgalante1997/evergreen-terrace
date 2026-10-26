/** @module Bubblewrap argv and environment for governed validation commands. */

import type { ValidationSandboxInput } from "./validation.types"

/**
 * The root filesystem is read-only. Only the worktree, a private `/tmp`, and
 * the factory dependency cache are writable. Check commands have no network;
 * only setup (dependency preparation) may reach the network.
 */
export const validationSandboxCommand = (input: ValidationSandboxInput): string[] => [
  "bwrap",
  "--die-with-parent",
  "--new-session",
  ...(input.phase === "check" ? ["--unshare-net"] : []),
  "--ro-bind",
  "/",
  "/",
  "--dev",
  "/dev",
  // Mounts apply in order: /tmp first, so a worktree or cache under /tmp is not shadowed.
  "--bind",
  input.temporaryDirectory,
  "/tmp",
  "--bind",
  input.worktreePath,
  input.worktreePath,
  "--bind",
  input.cacheDirectory,
  input.cacheDirectory,
  "--chdir",
  input.worktreePath,
  "/bin/sh",
  "-c",
  input.command
]

/** A minimal, credential-free environment; the bridge's own environment is never inherited. */
export const validationEnvironment = (cacheDirectory: string): Record<string, string> => {
  const inherited = Object.fromEntries(
    ["HOME", "LANG", "PATH", "USER"].flatMap((name) => {
      const value = process.env[name]
      return value === undefined ? [] : [[name, value]]
    })
  )
  return {
    ...inherited,
    BUN_INSTALL_CACHE_DIR: `${cacheDirectory}/bun`,
    CI: "1",
    NO_COLOR: "1",
    TEMP: "/tmp",
    TMP: "/tmp",
    TMPDIR: "/tmp",
    XDG_CACHE_HOME: cacheDirectory
  }
}
