/** @module Filesystem loader for an onboarded repository policy. */

import { join } from "node:path"
import { ProjectPolicyError } from "./project-policy.error"
import { parseProjectPolicy } from "./project-policy.parser"
import type { ProjectPolicy } from "./project-policy.types"

export const projectPolicyPath = (projectRoot: string): string => join(projectRoot, ".et", "config.toml")

export const loadProjectPolicy = async (projectRoot: string): Promise<ProjectPolicy> => {
  const path = projectPolicyPath(projectRoot)
  const file = Bun.file(path)
  if (!(await file.exists())) {
    throw new ProjectPolicyError(`Missing required project policy: ${path}`, undefined)
  }

  return parseProjectPolicy(await file.text())
}
