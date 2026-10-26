/** @module Key-order-independent JSON, so two parses of equivalent documents compare equal. */

export const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
        )
      : item
  )
