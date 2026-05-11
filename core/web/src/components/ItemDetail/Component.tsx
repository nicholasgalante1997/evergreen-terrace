import { memo, useState, useCallback } from "react"
import { pipeline } from "@/utils/pipeline"
import { ItemDetailView } from "./View"
import type { ItemDetailProps } from "./types"

function ItemDetailComponent({ item, lane, onDispatch, onComplete, onReturn }: ItemDetailProps) {
  const suggested = item.delegation.agent || "pm"
  const [selectedAgent, setSelectedAgent] = useState(suggested)
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const flash = (msg: string, ok: boolean) => {
    setFeedback({ msg, ok })
    setTimeout(() => setFeedback(null), 3000)
  }

  const handleDispatch = useCallback(async () => {
    setBusy(true)
    const ok = await onDispatch(item.item.id, selectedAgent)
    setBusy(false)
    flash(ok ? `Dispatched to ${selectedAgent}` : "Dispatch failed", ok)
  }, [item.item.id, selectedAgent, onDispatch])

  const handleComplete = useCallback(async () => {
    setBusy(true)
    const ok = await onComplete(item.item.id)
    setBusy(false)
    if (!ok) flash("Complete failed", false)
  }, [item.item.id, onComplete])

  const handleReturn = useCallback(async () => {
    setBusy(true)
    const ok = await onReturn(item.item.id)
    setBusy(false)
    if (!ok) flash("Return failed", false)
  }, [item.item.id, onReturn])

  return (
    <ItemDetailView
      item={item}
      lane={lane}
      selectedAgent={selectedAgent}
      busy={busy}
      feedback={feedback}
      onAgentChange={setSelectedAgent}
      onDispatch={() => void handleDispatch()}
      onComplete={() => void handleComplete()}
      onReturn={() => void handleReturn()}
    />
  )
}

export const ItemDetail = pipeline(memo)(ItemDetailComponent)
