/** @module PostgreSQL JSON column normalization. */

export const parseJsonColumn = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}
