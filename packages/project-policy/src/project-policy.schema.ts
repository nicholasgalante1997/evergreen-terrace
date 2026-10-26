/** @module Strict Zod schema for versioned .et project policy. */

import { z } from "zod"

const branchClassSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    prefix: z.string().regex(/^[a-z][a-z0-9-]*\/$/)
  })
  .strict()

const priorityClassSchema = z
  .object({
    name: z.string().regex(/^p[0-3]$/),
    weight: z.number().int().min(1).max(10_000)
  })
  .strict()

export const projectPolicySchema = z
  .object({
    version: z.literal(1),
    project_id: z.string().regex(/^[a-z0-9.-]+\/[a-z0-9._-]+\/[a-z0-9._-]+$/),
    canonical_remote: z.string().regex(/^[A-Za-z0-9._-]+$/),
    goals: z
      .object({
        max_concurrent: z.number().int().min(1).max(4)
      })
      .strict(),
    workers: z
      .object({
        default_per_goal: z.number().int().min(3).max(6),
        max_per_repository: z.number().int().min(3).max(6)
      })
      .strict(),
    branches: z
      .object({
        protected: z.array(z.string().min(1)).min(1),
        allowed_base_refs: z.array(z.string().min(1)).min(1),
        classes: z.array(branchClassSchema).min(1)
      })
      .strict(),
    priority_classes: z.array(priorityClassSchema).min(1),
    validation: z
      .object({
        /** Offline checks; run with no network access. */
        commands: z.array(z.string().min(1).max(2_048)).min(1).max(32),
        /** Dependency preparation (e.g. a frozen install); the only phase with network access. */
        setup: z.array(z.string().min(1).max(2_048)).max(16).default([]),
        timeout_seconds: z.number().int().min(10).max(7_200).default(1_200)
      })
      .strict(),
    permissions: z
      .object({
        /**
         * Auto-approve a worker command only when it exactly equals one of
         * `validation.commands`. Off by default: those commands run repository
         * code inside the worker sandbox, which has network and plan-auth access.
         */
        auto_approve_validation_commands: z.boolean().default(false)
      })
      .strict()
      .default({ auto_approve_validation_commands: false }),
    risk: z
      .object({
        decision_required: z
          .array(
            z.enum([
              "credential",
              "dependency",
              "destructive",
              "external_side_effect",
              "migration",
              "release",
              "security"
            ])
          )
          .min(1)
      })
      .strict()
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.workers.default_per_goal > policy.workers.max_per_repository) {
      context.addIssue({
        code: "custom",
        message: "workers.default_per_goal cannot exceed workers.max_per_repository",
        path: ["workers", "default_per_goal"]
      })
    }

    const branchClassNames = new Set<string>()
    for (const [index, branchClass] of policy.branches.classes.entries()) {
      if (branchClassNames.has(branchClass.name)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate branch class: ${branchClass.name}`,
          path: ["branches", "classes", index, "name"]
        })
      }
      branchClassNames.add(branchClass.name)
    }

    const priorityNames = new Set<string>()
    for (const [index, priorityClass] of policy.priority_classes.entries()) {
      if (priorityNames.has(priorityClass.name)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate priority class: ${priorityClass.name}`,
          path: ["priority_classes", index, "name"]
        })
      }
      priorityNames.add(priorityClass.name)
    }
  })
