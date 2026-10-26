/** @module Service runtime configuration helpers. */

export const readPort = (value: string | undefined, fallback: number): number => {
  const port = value === undefined || value.length === 0 ? fallback : Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Port must be an integer between 1 and 65535; received ${value ?? fallback}`)
  }

  return port
}
