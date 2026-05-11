import { useState, useEffect, useCallback, useRef } from "react"

export interface BeadEvent {
  ts: string
  type: "output" | "status" | "error" | "tool_use" | "usage"
  content: string
  meta?: Record<string, unknown>
}

export interface BeadInfo {
  bead: {
    id: string
    goal_id: string
    title: string
    role: string
    status: string
    item_type: string
    created: string
    started: string
    completed: string
  }
  worker: {
    cwd: string
    queue_item_id: string
    session_id: string
  }
}

export interface PromptData {
  prompt: string
  systemPrompt: string
}

export interface UseAgentFeedResult {
  bead: BeadInfo | null
  events: BeadEvent[]
  streaming: boolean
  error: string | null
  promptData: PromptData | null
  promptLoading: boolean
  dispatch: (promptOverride?: string) => Promise<boolean>
  approve: () => Promise<boolean>
  reject: () => Promise<boolean>
  retry: () => Promise<boolean>
}

const TERMINAL = new Set(["completed", "failed", "review_pending"])

export function useAgentFeed(queueItemId: string | null): UseAgentFeedResult {
  const [bead, setBead] = useState<BeadInfo | null>(null)
  const [events, setEvents] = useState<BeadEvent[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [promptData, setPromptData] = useState<PromptData | null>(null)
  const [promptLoading, setPromptLoading] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const lastConnectedBeadId = useRef<string | null>(null)

  // Lookup bead for this queue item
  useEffect(() => {
    if (!queueItemId) {
      setBead(null)
      setEvents([])
      setError(null)
      setPromptData(null)
      return
    }

    setError(null)

    const lookup = async () => {
      try {
        const res = await fetch(`/conductor/queue-item/${encodeURIComponent(queueItemId)}`)
        if (res.status === 404) {
          setBead(null)
          return
        }
        if (!res.ok) {
          setError("conductor unreachable")
          return
        }
        const data = (await res.json()) as BeadInfo
        setBead(data)
      } catch {
        setBead(null)
      }
    }

    void lookup()
    const poll = setInterval(() => void lookup(), 3000)
    return () => clearInterval(poll)
  }, [queueItemId])

  // Fetch prompt data while bead is prompt_pending
  useEffect(() => {
    if (!bead || bead.bead.status !== "prompt_pending") {
      setPromptData(null)
      setPromptLoading(false)
      return
    }

    setPromptLoading(true)

    const fetchPrompt = async () => {
      try {
        const res = await fetch(`/conductor/bead/${bead.bead.id}/prompt`)
        if (!res.ok) return
        const data = (await res.json()) as { prompt: string | null; systemPrompt: string | null }
        if (data.prompt !== null) {
          setPromptData({
            prompt: data.prompt,
            systemPrompt: data.systemPrompt ?? ""
          })
          setPromptLoading(false)
        }
        // prompt null means prep is still running — keep polling
      } catch {
        setPromptLoading(false)
      }
    }

    void fetchPrompt()
    const poll = setInterval(() => void fetchPrompt(), 1000)
    return () => clearInterval(poll)
  }, [bead?.bead.id, bead?.bead.status])

  // Subscribe to WebSocket stream when bead is active
  useEffect(() => {
    if (!bead) return
    if (bead.bead.status === "prompt_pending") return
    if (wsRef.current !== null) return
    if (TERMINAL.has(bead.bead.status) && events.length > 0) return

    // Clear events when switching to a new bead
    if (bead.bead.id !== lastConnectedBeadId.current) {
      setEvents([])
      lastConnectedBeadId.current = bead.bead.id
    }

    if (bead.bead.status === "pending" || bead.bead.status === "in_progress") {
      setStreaming(true)
      const proto = window.location.protocol === "https:" ? "wss" : "ws"
      const ws = new WebSocket(`${proto}://${window.location.host}/conductor/bead/${bead.bead.id}/ws`)
      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as BeadEvent | { type: "done"; status: string }
          if (msg.type === "done") {
            setStreaming(false)
            setBead((prev) =>
              prev ? { ...prev, bead: { ...prev.bead, status: (msg as { type: "done"; status: string }).status } } : prev
            )
            ws.close()
            wsRef.current = null
          } else {
            setEvents((prev) => [...prev, msg as BeadEvent])
          }
        } catch {
          /* ignore malformed */
        }
      }

      ws.onerror = () => {
        setStreaming(false)
        ws.close()
        wsRef.current = null
      }

      ws.onclose = () => {
        setStreaming(false)
        wsRef.current = null
      }
    }

    return () => {
      wsRef.current?.close()
      wsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bead?.bead.id, bead?.bead.status])

  const dispatch = useCallback(
    async (promptOverride?: string): Promise<boolean> => {
      if (!bead) return false
      try {
        const body: Record<string, string> = {}
        if (promptOverride !== undefined) body["prompt"] = promptOverride
        const res = await fetch(`/conductor/bead/${bead.bead.id}/prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        })
        if (res.ok) {
          setBead((prev) => (prev ? { ...prev, bead: { ...prev.bead, status: "pending" } } : prev))
          setPromptData(null)
          return true
        }
        return false
      } catch {
        return false
      }
    },
    [bead]
  )

  const approve = useCallback(async (): Promise<boolean> => {
    if (!bead) return false
    try {
      const res = await fetch(`/conductor/bead/${bead.bead.id}/approve`, { method: "POST" })
      if (res.ok) {
        setBead((prev) => (prev ? { ...prev, bead: { ...prev.bead, status: "completed" } } : prev))
        return true
      }
      return false
    } catch {
      return false
    }
  }, [bead])

  const reject = useCallback(async (): Promise<boolean> => {
    if (!bead) return false
    try {
      const res = await fetch(`/conductor/bead/${bead.bead.id}/reject`, { method: "POST" })
      if (res.ok) {
        setBead((prev) => (prev ? { ...prev, bead: { ...prev.bead, status: "failed" } } : prev))
        return true
      }
      return false
    } catch {
      return false
    }
  }, [bead])

  const retry = useCallback(async (): Promise<boolean> => {
    if (!bead) return false
    try {
      const res = await fetch(`/conductor/bead/${bead.bead.id}/retry`, { method: "POST" })
      if (res.ok) {
        setBead((prev) => (prev ? { ...prev, bead: { ...prev.bead, status: "pending" } } : prev))
        setEvents([])
        lastConnectedBeadId.current = null
        wsRef.current = null
        return true
      }
      return false
    } catch {
      return false
    }
  }, [bead])

  return { bead, events, streaming, error, promptData, promptLoading, dispatch, approve, reject, retry }
}
