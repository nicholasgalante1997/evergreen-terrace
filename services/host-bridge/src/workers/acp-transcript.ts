/** @module Extraction of an agent's final message from a preserved ACP event log. */

interface LoggedEvent {
  kind?: unknown
  payload?: { update?: { content?: { text?: unknown; type?: unknown }; messageId?: unknown; sessionUpdate?: unknown } }
}

/**
 * Returns the text of the agent's last message. Each notification is logged as
 * both `session.update` and `session.active_update`; only the former is read so
 * chunks are not doubled. Returns "" when the log is missing or has no text.
 */
export const finalAgentMessage = async (eventLogPath: string): Promise<string> => {
  const file = Bun.file(eventLogPath)
  if (!(await file.exists())) {
    return ""
  }
  const chunks: Array<{ messageId: string; text: string }> = []
  for (const line of (await file.text()).split("\n")) {
    if (line.trim().length === 0) {
      continue
    }
    let event: LoggedEvent
    try {
      event = JSON.parse(line) as LoggedEvent
    } catch {
      continue
    }
    const update = event.payload?.update
    if (
      event.kind === "session.update" &&
      update?.sessionUpdate === "agent_message_chunk" &&
      update.content?.type === "text" &&
      typeof update.content.text === "string"
    ) {
      chunks.push({ messageId: typeof update.messageId === "string" ? update.messageId : "", text: update.content.text })
    }
  }
  const last = chunks.at(-1)?.messageId
  return chunks
    .filter((chunk) => chunk.messageId === last)
    .map((chunk) => chunk.text)
    .join("")
    .trim()
}
