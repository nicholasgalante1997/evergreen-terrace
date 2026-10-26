/** @module Command-worker persistence contracts. */

import type { WorkerAdapter, WorkerAssignment, WorkerState } from "@evergreen-terrace/contracts"

export interface WorkerRecord extends WorkerAssignment {
  assignedEventId: string
  briefSha256: string | null
  createdAt: Date
  id: string
  lastEventId: string
  leaseExpiresAt: Date | null
  leaseOwner: string | null
  sequence: number
  state: WorkerState
  stateDetail: string
  updatedAt: Date
}

export interface NewWorker {
  assignedEventId: string
  id: string
  worker: WorkerAssignment
}

export interface CommandWorkerSummary {
  adapter: WorkerAdapter
  created_at: Date
  goal_id: string
  id: string
  project_id: string
  role: string
  state: WorkerState
  updated_at: Date
}

export interface WorkerBriefRecord {
  prompt: string
  recordedEventId: string
  sha256: string
  workerId: string
}

export interface WorkerLeaseUpdate {
  eventId: string
  expiresAt: Date | null
  owner: string | null
  sequence: number
}
