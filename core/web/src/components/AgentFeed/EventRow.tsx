import { useState } from "react"
import type { BeadEvent } from "@/hooks/useAgentFeed"

interface EventRowProps {
  ev: BeadEvent
}

export function EventRow({ ev }: EventRowProps) {
  const [expanded, setExpanded] = useState(false)

  if (ev.type === "status") {
    return (
      <div className="feed__event feed__event--status">
        <span className="feed__event-ts">{ev.ts.slice(11, 19)}</span>
        <span className="feed__event-content">{ev.content}</span>
      </div>
    )
  }

  if (ev.type === "error") {
    return (
      <div className="feed__event feed__event--error">
        <span className="feed__event-ts">{ev.ts.slice(11, 19)}</span>
        <span className="feed__event-content">{ev.content}</span>
      </div>
    )
  }

  if (ev.type === "tool_use") {
    const tool = String(ev.meta?.["tool"] ?? "")
    const input = ev.meta?.["input"] as Record<string, unknown> | undefined
    return (
      <div className="feed__event feed__event--tool">
        <span className="feed__event-ts">{ev.ts.slice(11, 19)}</span>
        <span className={`feed__tool-badge feed__tool-badge--${tool.toLowerCase()}`}>{tool}</span>
        <span
          className="feed__event-content feed__event-content--tool"
          onClick={() => input && setExpanded((e) => !e)}
          style={{ cursor: input ? "pointer" : "default" }}
        >
          {ev.content.replace(/^[A-Za-z]+\s+/, "")}
        </span>
        {expanded && input && <pre className="feed__tool-input">{JSON.stringify(input, null, 2)}</pre>}
      </div>
    )
  }

  if (ev.type === "usage") {
    return (
      <div className="feed__event feed__event--usage">
        <span className="feed__usage-icon">◈</span>
        <span className="feed__usage-content">{ev.content}</span>
      </div>
    )
  }

  return (
    <div className="feed__event feed__event--output">
      <span className="feed__event-content">{ev.content}</span>
    </div>
  )
}
