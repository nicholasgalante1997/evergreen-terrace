/** @module TOML-to-policy parsing and strict validation. */

import TOML from "toml"
import { ProjectPolicyError } from "./project-policy.error"
import { projectPolicySchema } from "./project-policy.schema"
import type { ProjectPolicy } from "./project-policy.types"

export const parseProjectPolicy = (content: string): ProjectPolicy => {
  let rawPolicy: unknown
  try {
    rawPolicy = TOML.parse(content)
  } catch (error) {
    throw new ProjectPolicyError("Unable to parse .et/config.toml", error)
  }

  const parsed = projectPolicySchema.safeParse(rawPolicy)
  if (!parsed.success) {
    throw new ProjectPolicyError(".et/config.toml does not match the strict project policy contract", parsed.error.issues)
  }

  return parsed.data
}
