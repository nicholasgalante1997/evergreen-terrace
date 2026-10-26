/** @module Automatic command-approval policy inputs, derived from `.et/config.toml`. */

export interface AutomaticApprovalPolicy {
  autoApproveValidationCommands: boolean
  /** The project's `validation.commands`; matched exactly, never as a prefix. */
  validationCommands: readonly string[]
}
