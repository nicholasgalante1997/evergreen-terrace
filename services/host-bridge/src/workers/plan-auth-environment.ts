/** @module Plan-auth ACP environment filtering. */

const apiKeyNames = new Set(["ANTHROPIC_API_KEY", "CODEX_API_KEY", "OPENAI_API_KEY"])

export const planAuthEnvironment = (): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(process.env).filter(([name]) => !apiKeyNames.has(name)))
