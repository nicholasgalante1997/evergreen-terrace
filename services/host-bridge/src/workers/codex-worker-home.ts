/** @module Isolated Codex runtime-home preparation. */

import { mkdir, writeFile } from "node:fs/promises"

export const codexWorkerHomePath = (artifactDirectory: string): string => `${artifactDirectory}/codex-home`

export const prepareCodexWorkerHome = async (artifactDirectory: string): Promise<string> => {
  const home = codexWorkerHomePath(artifactDirectory)
  await mkdir(home, { recursive: true })
  await writeFile(`${home}/auth.json`, "", { flag: "a" })
  return home
}
