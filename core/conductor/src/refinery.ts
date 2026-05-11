import type { Bead } from "./types"

/**
 * Groups beads by shared output_files. Beads that share any output file
 * must be serialized — only one can be in_progress at a time.
 */
export function getDispatchable(beads: Bead[], maxConcurrent: number): Bead[] {
  const inProgress = beads.filter((b) => b.bead.status === "in_progress")
  const pending = beads.filter((b) => b.bead.status === "pending")

  if (inProgress.length >= maxConcurrent || pending.length === 0) {
    return []
  }

  const lockedFiles = new Set<string>()
  for (const b of inProgress) {
    for (const f of b.task.output_files) {
      lockedFiles.add(f)
    }
  }

  const dispatchable: Bead[] = []
  const slots = maxConcurrent - inProgress.length

  for (const bead of pending) {
    if (dispatchable.length >= slots) break
    const conflicts = bead.task.output_files.some((f) => lockedFiles.has(f))
    if (!conflicts) {
      dispatchable.push(bead)
      for (const f of bead.task.output_files) {
        lockedFiles.add(f)
      }
    }
  }

  return dispatchable
}
