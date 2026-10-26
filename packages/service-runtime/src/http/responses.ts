/** @module HTTP response constructors. */

export const jsonError = (status: number, code: string, message: string, details?: unknown): Response => {
  return Response.json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, { status })
}
