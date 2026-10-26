/** @module Read-API row shapes as the console receives them (JSON: timestamps are ISO strings). */

export interface ConsoleGoal {
  base_ref: string
  base_sha: string
  description: string
  id: string
  priority_class: string
  project_id: string
  state: string
  submitted_at: string
  title: string
  updated_at: string
}

export interface ConsoleDecisionOption {
  detail: string
  id: string
  label: string
}

export interface ConsoleDecision {
  category: string
  context: string
  goal_id: string | null
  id: string
  options: ConsoleDecisionOption[]
  project_id: string
  recommended_option_id: string | null
  requested_at: string
  resolution: { note: string; selectedOptionId: string | null; status: "approved" | "rejected" } | null
  resolved_at: string | null
  status: "requested" | "approved" | "rejected"
  title: string
}

export interface ConsoleWorker {
  adapter: string
  brief_sha256: string | null
  depends_on_worker_ids: string[]
  goal_id: string
  id: string
  lease_expires_at: string | null
  lease_owner: string | null
  project_id: string
  role: string
  state: string
  state_detail: string
  updated_at: string
  worktree: { attempt: number; baseSha: string; branch: string; worktreePath: string }
}

export interface ConsoleValidationResult {
  command: string
  durationMs: number
  exitCode: number | null
  phase: "setup" | "check"
  timedOut: boolean
}

export interface ConsoleValidation {
  commitSha: string
  completedAt: string
  goalId: string
  id: string
  results: ConsoleValidationResult[]
  startedAt: string
  status: "passed" | "failed"
  subject: { id: string; type: "worker" | "integration" }
}

export interface ConsoleIntegration {
  attempt: number
  base_sha: string
  completion: {
    aggregateDiff: { deletions: number; filesChanged: number; insertions: number; sha256: string } | null
    branch: string
    conflict: { paths: string[]; workerId: string } | null
    detail: string
    headSha: string | null
    mergeOrder: string[]
    overlaps: Array<{ path: string; workerIds: string[] }>
    resolutions: Array<{ conflictedWorkerId: string; integratorWorkerId: string; paths: string[]; rationale: string }>
    scopeViolations: Array<{ paths: string[]; taskKey: string; workerId: string }>
    selection: { excludedWorkerIds: string[]; rationale: string } | null
    sources: Array<{
      changedFiles: string[]
      commitSha: string
      deletions: number
      insertions: number
      role: string
      workerId: string
    }>
    validationId: string | null
  } | null
  goal_id: string
  id: string
  project_id: string
  resolves_integration_id: string | null
  started_at: string
  status: string
  updated_at: string
}

export interface ConsoleHandoff {
  decision_id: string
  detail: string
  goal_id: string
  id: string
  integration_id: string
  plan: { baseRef: string; branch: string; headSha: string; repository: string; title: string }
  project_id: string
  result: { pullRequest: { number: number; url: string } } | null
  status: string
  updated_at: string
}

export interface ConsolePlanTask {
  acceptance: string[]
  briefLength: number
  dependsOn: string[]
  key: string
  role: string
  scope: string[]
  title: string
}

export interface ConsolePlan {
  decisionId: string | null
  detail: string
  goalId: string
  id: string
  launch: { workers: Array<{ taskKey: string; workerId: string }> } | null
  overlaps: Array<{ otherGoalId: string; otherTaskKey: string; paths: string[]; taskKey: string }>
  projectId: string
  proposal: {
    contract: { acceptance: string[]; assumptions: string[]; outOfScope: string[] }
    integrateAfterGoalIds: string[]
    questions: Array<{ id: string; question: string }>
    risks: Array<{ category: string; detail: string; mitigation: string }>
    summary: string
    tasks: ConsolePlanTask[]
  } | null
  questionDecisionIds: string[]
  revision: number
  status: string
  updatedAt: string
}

export interface ConsoleOnboarding {
  decisionId: string | null
  detail: string
  id: string
  packet: { configToml: string; facts: { baseRef: string; baseSha: string } } | null
  projectId: string
  result: { branch: string; commitSha: string; validation: { status: string } | null } | null
  revision: number
  status: string
  updatedAt: string
}

export interface ConsolePreference {
  category: string
  id: string
  key: string
  projectId: string | null
  scope: string
  status: string
  value: string
}

export interface ConsoleEvent {
  actor: { id: string; kind: string }
  aggregateId: string
  aggregateType: string
  eventId: string
  eventType: string
  occurredAt: string
  sequence: number
}

export interface ConsoleFreshness {
  applied_at: string
  event_id: string
  occurred_at: string
}

/** Everything one console render needs, read in one pass from the read API. */
export interface ConsoleSnapshot {
  decisions: ConsoleDecision[]
  events: ConsoleEvent[]
  freshness: ConsoleFreshness | null
  goals: ConsoleGoal[]
  handoffs: ConsoleHandoff[]
  integrations: ConsoleIntegration[]
  onboardings: ConsoleOnboarding[]
  plans: ConsolePlan[]
  preferences: ConsolePreference[]
  readAt: string
  validations: ConsoleValidation[]
  workers: ConsoleWorker[]
}
