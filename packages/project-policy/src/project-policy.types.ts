/** @module Onboarded project-policy contracts. */

import type { z } from "zod"
import type { projectPolicySchema } from "./project-policy.schema"

export type ProjectPolicy = z.infer<typeof projectPolicySchema>
export type BranchClass = ProjectPolicy["branches"]["classes"][number]
export type PriorityClass = ProjectPolicy["priority_classes"][number]
