/** @module Mayor goal-plan persistence contracts. */

import type {
  MayorPlan,
  PlanLaunchCompletion,
  PlanMayorSession,
  PlanOverlap,
  PlanStatus,
  RiskCategory
} from "@evergreen-terrace/contracts"

export interface PlanRecord {
  createdAt: Date
  decisionId: string | null
  detail: string
  feedback: string
  flaggedRisks: RiskCategory[]
  goalId: string
  id: string
  idempotencyKey: string
  lastEventId: string
  launch: PlanLaunchCompletion | null
  mayor: PlanMayorSession
  overlaps: PlanOverlap[]
  projectId: string
  /** The full mayor output, including each task's brief text. */
  proposal: MayorPlan | null
  questionDecisionIds: string[]
  revision: number
  revisionOf: string | null
  sequence: number
  status: PlanStatus
  updatedAt: Date
}

export interface PlanChange {
  decisionId: string | null
  detail: string
  eventId: string
  flaggedRisks: RiskCategory[]
  launch: PlanLaunchCompletion | null
  overlaps: PlanOverlap[]
  proposal: MayorPlan | null
  questionDecisionIds: string[]
  sequence: number
  status: PlanStatus
}
