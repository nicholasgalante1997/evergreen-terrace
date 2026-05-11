import type { createStore } from "./store"

const STALL_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes without completion

export function startWitness(store: ReturnType<typeof createStore>, intervalMs: number = 60_000): { stop: () => void } {
  const timer = setInterval(async () => {
    try {
      const beads = await store.readAllBeads()
      const now = Date.now()

      for (const bead of beads) {
        if (bead.bead.status !== "in_progress") continue
        if (!bead.bead.started) continue

        const started = new Date(bead.bead.started).getTime()
        if (now - started > STALL_THRESHOLD_MS) {
          console.log(`[witness] re-queuing stalled bead ${bead.bead.id}`)
          bead.bead.status = "pending"
          bead.bead.started = ""
          bead.worker.session_id = ""
          await store.writeBead(bead)
        }
      }
    } catch (err) {
      console.error("[witness] error during health check:", err)
    }
  }, intervalMs)

  return { stop: () => clearInterval(timer) }
}
