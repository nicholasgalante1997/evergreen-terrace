export type ItemPriority = "p0" | "p1" | "p2" | "p3";
export type StackPreset =
  | "bun-ts"
  | "rust"
  | "generic"
  | "docker-linux"
  | "design-system"
  | "turborepo";
export type Integration = "jira" | "gitlab" | "figma";

export interface ProjectEntry {
  name: string;
  repoPath: string;
  description: string;
  priority: ItemPriority;
}

export interface WizardOptions {
  dryRun: boolean;
}

export interface WizardAnswers {
  userName: string;
  orgName: string;
  projects: ProjectEntry[];
  stack: StackPreset;
  integrations: Integration[];
  outputDir: string;
}
