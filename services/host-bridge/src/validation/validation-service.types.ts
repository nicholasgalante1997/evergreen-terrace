/** @module Command-API port used by the validation service. */

import type { ValidationRecord } from "@evergreen-terrace/contracts"
import type { CommandValidationResult } from "../command-api/command-api-client.types"

export interface ValidationEvidencePort {
  recordValidation(input: ValidationRecord): Promise<CommandValidationResult>
}
