/** @module Deliberately minimal shell-word splitting for automatic command approval. */

/** Unquoted characters that are plain text in every POSIX shell. */
const plainCharacter = /[A-Za-z0-9_./:=@%+,-]/

/**
 * Splits one simple command into words, or returns null when the text has any
 * shell semantics: operators, redirects, expansions, globs, escapes, comments,
 * or newlines. Single quotes hold literal text; double quotes may not contain
 * `$`, backticks, or backslashes. Null means "not provably simple" and always
 * leads to a decision card. Nothing here is ever executed.
 */
export const splitSimpleCommand = (text: string): string[] | null => {
  const words: string[] = []
  let current = ""
  let inWord = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? ""
    if (character === " " || character === "\t") {
      if (inWord) {
        words.push(current)
        current = ""
        inWord = false
      }
      continue
    }
    if (character === "'" || character === '"') {
      const close = text.indexOf(character, index + 1)
      if (close === -1) {
        return null
      }
      const quoted = text.slice(index + 1, close)
      if (character === '"' && /[$`\\]/.test(quoted)) {
        return null
      }
      if (/[\n\r]/.test(quoted)) {
        return null
      }
      current += quoted
      inWord = true
      index = close
      continue
    }
    if (!plainCharacter.test(character)) {
      return null
    }
    current += character
    inWord = true
  }
  if (inWord) {
    words.push(current)
  }
  return words.length === 0 ? null : words
}
