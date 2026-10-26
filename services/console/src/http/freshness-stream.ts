/** @module Server-sent events: a push whenever the projection watermark moves. */

import type { ConsoleFreshness } from "../read-model/read-model.types"

export interface FreshnessStreamOptions {
  heartbeatMs: number
  intervalMs: number
  read(): Promise<ConsoleFreshness | null>
  signal: AbortSignal
}

/**
 * Polls the read API's watermark and emits `freshness` only when it changes,
 * plus a comment heartbeat so proxies keep the stream open. A failed read is
 * reported as `unavailable` rather than closing the stream.
 */
export const freshnessStream = (options: FreshnessStreamOptions): Response => {
  const encoder = new TextEncoder()
  let timer: ReturnType<typeof setInterval> | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let last: string | undefined
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          stop()
        }
      }
      const stop = () => {
        clearInterval(timer)
        clearInterval(heartbeat)
        try {
          controller.close()
        } catch {
          // Already closed by the client.
        }
      }
      const tick = async () => {
        let event: string
        let data: string
        try {
          const freshness = await options.read()
          event = "freshness"
          data = JSON.stringify({ freshness })
        } catch (error) {
          event = "unavailable"
          data = JSON.stringify({ message: error instanceof Error ? error.message : String(error) })
        }
        if (`${event}:${data}` !== last) {
          last = `${event}:${data}`
          send(`event: ${event}\ndata: ${data}\n\n`)
        }
      }
      void tick()
      timer = setInterval(() => void tick(), options.intervalMs)
      heartbeat = setInterval(() => send(": heartbeat\n\n"), options.heartbeatMs)
      options.signal.addEventListener("abort", stop, { once: true })
    },
    cancel() {
      clearInterval(timer)
      clearInterval(heartbeat)
    }
  })
  return new Response(body, {
    headers: { "cache-control": "no-store", connection: "keep-alive", "content-type": "text/event-stream" }
  })
}
