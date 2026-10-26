/** @module Project-policy parse and validation errors. */

export class ProjectPolicyError extends Error {
  constructor(
    message: string,
    override readonly cause: unknown
  ) {
    super(message)
    this.name = "ProjectPolicyError"
  }
}
