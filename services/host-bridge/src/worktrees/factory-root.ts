/** @module Local factory-root resolution. */

import { join } from "node:path"

export const defaultFactoryRoot = (): string => {
  const stateRoot = process.env["XDG_STATE_HOME"] ?? join(process.env["HOME"] ?? "/tmp", ".local", "state")
  return join(stateRoot, "evergreen-terrace")
}
