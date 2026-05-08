export type BeadStatus = "pending" | "in_progress" | "completed" | "failed";

export type WorkerRole = "eng-senior" | "eng-mid" | "eng-junior" | "design" | "qa";

export interface Bead {
  bead: {
    id: string;
    goal_id: string;
    title: string;
    role: WorkerRole;
    status: BeadStatus;
    created: string;
    started: string;
    completed: string;
  };
  task: {
    description: string;
    acceptance: string;
    context_files: string[];
    output_files: string[];
  };
  worker: {
    session_id: string;
  };
}

export interface Goal {
  goal: {
    id: string;
    description: string;
    status: "pending" | "in_progress" | "completed" | "failed";
    created: string;
  };
}
