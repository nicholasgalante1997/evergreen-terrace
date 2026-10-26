/** @module Validation and integration evidence types inferred from strict Zod schemas. */

import type { z } from "zod"
import type { actorSchema } from "./events"
import type {
  integrationCompletionSchema,
  integrationOverlapSchema,
  integrationResolutionSchema,
  integrationScopeViolationSchema,
  integrationSelectionSchema,
  integrationSourceSchema,
  integrationStartSchema,
  integrationTerminalStatusSchema,
  integrationUpdatedPayloadSchema,
  validationCommandResultSchema,
  validationCompletedPayloadSchema,
  validationRecordSchema,
  validationSubjectSchema
} from "./evidence-events"

export type ValidationCommandResult = z.infer<typeof validationCommandResultSchema>
export type ValidationSubject = z.infer<typeof validationSubjectSchema>
export type ValidationRecord = z.infer<typeof validationRecordSchema>
export type ValidationCompletedPayload = z.infer<typeof validationCompletedPayloadSchema>
export type IntegrationStart = z.infer<typeof integrationStartSchema>
export type IntegrationSource = z.infer<typeof integrationSourceSchema>
export type IntegrationOverlap = z.infer<typeof integrationOverlapSchema>
export type IntegrationResolution = z.infer<typeof integrationResolutionSchema>
export type IntegrationScopeViolation = z.infer<typeof integrationScopeViolationSchema>
export type IntegrationSelection = z.infer<typeof integrationSelectionSchema>
export type IntegrationTerminalStatus = z.infer<typeof integrationTerminalStatusSchema>
export type IntegrationCompletion = z.infer<typeof integrationCompletionSchema>
export type IntegrationUpdatedPayload = z.infer<typeof integrationUpdatedPayloadSchema>
/** Caller-facing shapes: defaulted fields are optional and filled when the schema parses. */
export type IntegrationStartInput = z.input<typeof integrationStartSchema>
export type IntegrationCompletionInput = z.input<typeof integrationCompletionSchema>

export interface ValidationCompletedEventInput {
  actor: z.infer<typeof actorSchema>
  correlationId: string
  validation: ValidationRecord
  validationId: string
}

export interface IntegrationUpdatedEventInput {
  actor: z.infer<typeof actorSchema>
  causationId: string | null
  correlationId: string
  integration: z.input<typeof integrationUpdatedPayloadSchema>["integration"]
  sequence: number
}
