/** @module Pure merge-order and overlap analysis for the integration train. */

import type { IntegrationOverlap } from "@evergreen-terrace/contracts"

interface PlannedWorker {
  dependsOnWorkerIds: readonly string[]
  id: string
}

/**
 * Orders workers so every prerequisite merges first. Ties keep assignment
 * order. Edges to workers outside the set are ignored: the command API only
 * admits backward same-goal edges, so the graph is acyclic by construction.
 */
export const mergeOrder = (workers: readonly PlannedWorker[]): string[] => {
  const included = new Set(workers.map((worker) => worker.id))
  const ordered: string[] = []
  const placed = new Set<string>()
  while (ordered.length < workers.length) {
    const next = workers.find(
      (worker) =>
        !placed.has(worker.id) &&
        worker.dependsOnWorkerIds.every((dependency) => !included.has(dependency) || placed.has(dependency))
    )
    if (next === undefined) {
      throw new Error("Worker dependency graph contains a cycle")
    }
    ordered.push(next.id)
    placed.add(next.id)
  }
  return ordered
}

/** Files changed by two or more sources: the review hotspots and likely conflicts. */
export const changedFileOverlaps = (
  sources: ReadonlyArray<{ changedFiles: readonly string[]; workerId: string }>
): IntegrationOverlap[] => {
  const owners = new Map<string, string[]>()
  for (const source of sources) {
    for (const path of new Set(source.changedFiles)) {
      owners.set(path, [...(owners.get(path) ?? []), source.workerId])
    }
  }
  return [...owners.entries()]
    .filter(([, workerIds]) => workerIds.length > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, workerIds]) => ({ path, workerIds }))
}
