export type BeadStatus = "pending" | "prompt_pending" | "in_progress" | "review_pending" | "completed" | "failed"

export type AgentRole =
  | "eng-senior"
  | "eng-mid"
  | "eng-junior"
  | "pm"
  | "director"
  | "voice"
  | "stakeholder"
  | "momentum-sentinel"
  | "design"
  | "qa"

export type WorkerRole = AgentRole

/** Ticket types that require a human review gate before auto-completion */
export const REVIEW_GATED_TYPES = new Set(["feature", "bug", "ops"])

export interface BeadEvent {
  ts: string
  type: "output" | "status" | "error" | "tool_use" | "usage"
  content: string
  meta?: Record<string, unknown>
}

export interface Bead {
  bead: {
    id: string
    goal_id: string
    title: string
    role: AgentRole
    status: BeadStatus
    item_type: string // queue item type — used to determine review gate
    created: string
    started: string
    completed: string
  }
  task: {
    description: string
    acceptance: string
    context_files: string[]
    output_files: string[]
  }
  worker: {
    session_id: string
    cwd: string // CRITICAL: project repo working directory for claude -p
    project: string // project name — used to load context TOML for system prompt
    queue_item_id: string // originating queue item id, if dispatched from queue
  }
}

export interface Goal {
  goal: {
    id: string
    description: string
    status: "pending" | "in_progress" | "completed" | "failed"
    created: string
    queue_item_id: string // originating queue item id, if any
  }
}
