/** @module Canonical project identity from a Git remote URL, with credentials removed. */

import { tryProcess } from "../process/run-process"

/** Removes any `user:password@` from a URL so it can be shown, logged, or recorded. */
export const withoutCredentials = (url: string): string => url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, "$1")

interface ParsedRemote {
  host: string
  path: string
  /** scp-like and ssh:// remotes may name an SSH config alias rather than a real host. */
  ssh: boolean
}

const parseRemote = (url: string): ParsedRemote | null => {
  const trimmed = url.trim()
  const withScheme = /^(https?|ssh|git):\/\/(?:[^/@]*@)?([^/:]+)(?::\d+)?\/(.+)$/i.exec(trimmed)
  if (withScheme !== null) {
    const [, scheme = "", host = "", path = ""] = withScheme
    return { host, path, ssh: scheme.toLowerCase() === "ssh" }
  }
  const scpLike = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/)(.+)$/.exec(trimmed)
  if (scpLike !== null) {
    const [, host = "", path = ""] = scpLike
    return { host, path, ssh: true }
  }
  return null
}

/** Resolves an SSH alias (`Host gh-work` → `HostName github.com`) without connecting. */
export const resolveSshHost = async (host: string): Promise<string> => {
  const resolved = await tryProcess(["ssh", "-G", host], "/")
  const hostname = resolved.exitCode === 0 ? /^hostname\s+(\S+)$/im.exec(resolved.stdout)?.[1] : undefined
  return hostname ?? host
}

/**
 * `host/owner/repository`, lowercase, the form `.et/config.toml` names as
 * `project_id`. Null for a remote that is not a two-level repository path.
 */
export const normalizeRemote = async (
  url: string,
  resolveHost: (host: string) => Promise<string> = resolveSshHost
): Promise<string | null> => {
  const parsed = parseRemote(url)
  if (parsed === null) {
    return null
  }
  const host = (parsed.ssh ? await resolveHost(parsed.host) : parsed.host).toLowerCase()
  const segments = parsed.path
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .split("/")
    .filter((segment) => segment.length > 0)
  if (segments.length !== 2) {
    return null
  }
  const identity = `${host}/${segments.join("/")}`.toLowerCase()
  return /^[a-z0-9.-]+\/[a-z0-9._-]+\/[a-z0-9._-]+$/.test(identity) ? identity : null
}
