/** @module Adapter-specific plan-auth runtime environment. */

import type { AcpAdapter } from "./acp-runner.types"
import { codexWorkerHomePath } from "./codex-worker-home"

export const adapterRuntimeEnvironment = (adapter: AcpAdapter, artifactDirectory: string): NodeJS.ProcessEnv =>
  adapter === "codex" ? { CODEX_HOME: codexWorkerHomePath(artifactDirectory) } : {}
