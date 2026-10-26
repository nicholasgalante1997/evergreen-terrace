# SPEC_03 — Wizard Flow

## Context

The wizard collects all information needed to generate a consumer's personal context files. It is built with `ink` (React for the terminal) and `@inkjs/ui` (pre-built interactive components), giving the user a modern, navigable TUI experience. `picocolors` is used for styled output in the pre-wizard banner and post-wizard progress messages that live outside the ink render tree.

`runWizard` returns a `Promise<WizardAnswers>` by wrapping an ink `render()` call. The ink app calls `onComplete` when the user confirms, which resolves the promise and unmounts the app. No file generation occurs in this spec — the wizard runs and returns data.

A `--dry-run` flag causes the wizard to run normally, then print `WizardAnswers` as JSON and exit before calling `scaffold()`.

## Prerequisites

- SPEC_02 complete (package scaffold, types, `wizard.tsx` stub exist)

## Requirements

### 1. `src/index.ts` — entry point update

Extends the SPEC_02 `cac` CLI with a `--dry-run` option. The `TEMPLATES_DIR` export and `PACKAGE_ROOT` derivation from SPEC_02 remain unchanged — this update only adds the option and the dry-run branch.

```typescript
import { dirname, join, resolve } from "node:path";
import cac from "cac";
import pc from "picocolors";
import { runWizard } from "./wizard";
import { scaffold } from "./scaffold";

const PACKAGE_ROOT = dirname(dirname(new URL(import.meta.url).pathname));
export const TEMPLATES_DIR = join(PACKAGE_ROOT, "templates");

const cli = cac("create-grove");

cli
  .command("[output-dir]", "Scaffold a personal engineering org")
  .option("--dry-run", "Run wizard without writing files; print collected answers as JSON")
  .action(async (outputDir: string | undefined, options: { dryRun: boolean }) => {
    if (!outputDir) {
      cli.outputHelp();
      process.exit(1);
    }
    const resolved = resolve(process.cwd(), outputDir);
    const answers = await runWizard(resolved, { dryRun: options.dryRun });

    if (options.dryRun) {
      console.log(pc.dim("\n--- dry-run output ---"));
      console.log(JSON.stringify(answers, null, 2));
      process.exit(0);
    }

    await scaffold(answers);
  });

cli.help();
cli.version("0.1.0");
cli.parse();
```

`--dry-run` is registered as a cac option, not parsed from `process.argv` manually. `--help` and `--version` continue to be handled automatically by cac.

### 2. `WizardOptions` type

Add to `src/types.ts`:

```typescript
export interface WizardOptions {
  dryRun: boolean;
}
```

### 3. Wizard entry — `src/wizard.tsx`

`runWizard` wraps an ink `render()` in a Promise. Ctrl+C is handled by catching SIGINT before ink's default handler fires (`exitOnCtrlC: false`).

```tsx
import React from "react";
import { render } from "ink";
import pc from "picocolors";
import { WizardApp } from "./components/WizardApp";
import type { WizardAnswers, WizardOptions } from "./types";

export async function runWizard(
  outputDir: string,
  options: WizardOptions,
): Promise<WizardAnswers> {
  return new Promise<WizardAnswers>((resolve) => {
    const { unmount } = render(
      <WizardApp
        outputDir={outputDir}
        dryRun={options.dryRun}
        onComplete={(answers) => {
          unmount();
          resolve(answers);
        }}
      />,
      { exitOnCtrlC: false },
    );

    process.once("SIGINT", () => {
      unmount();
      process.stdout.write(pc.yellow("\nCancelled.\n"));
      process.exit(1);
    });
  });
}
```

### 4. Component architecture

The wizard is a stage-based state machine rendered as a single ink `<WizardApp>` component. Each stage renders a focused prompt. Completed answers are shown as dimmed confirmation lines above the current prompt — a "receipt" pattern that gives the user a running sense of their inputs.

```
src/
├── wizard.tsx                runWizard() — Promise wrapper
└── components/
    ├── WizardApp.tsx         root component, stage state machine
    ├── Header.tsx            banner, output path, requirements note
    ├── ReceiptLine.tsx       dimmed "✓ field: value" confirmation row
    ├── IdentityStage.tsx     userName → orgName
    ├── ProjectsStage.tsx     project sub-loop (name → repo → desc → priority → add more?)
    ├── StackStage.tsx        single Select
    ├── IntegrationsStage.tsx MultiSelect (optional)
    └── ConfirmStage.tsx      summary + ConfirmInput
```

### 5. `WizardApp.tsx` — stage orchestrator

```tsx
import React, { useState, useCallback } from "react";
import { Box } from "ink";
import type { Integration, ItemPriority, ProjectEntry, StackPreset, WizardAnswers } from "../types";
import { Header } from "./Header";
import { IdentityStage } from "./IdentityStage";
import { ProjectsStage } from "./ProjectsStage";
import { StackStage } from "./StackStage";
import { IntegrationsStage } from "./IntegrationsStage";
import { ConfirmStage } from "./ConfirmStage";

type Stage = "identity" | "projects" | "stack" | "integrations" | "confirm";

interface WizardState {
  userName: string;
  orgName: string;
  projects: ProjectEntry[];
  stack: StackPreset | null;
  integrations: Integration[];
}

interface WizardAppProps {
  outputDir: string;
  dryRun: boolean;
  onComplete: (answers: WizardAnswers) => void;
}

export function WizardApp({ outputDir, dryRun, onComplete }: WizardAppProps) {
  const [stage, setStage] = useState<Stage>("identity");
  const [state, setState] = useState<WizardState>({
    userName: "",
    orgName: "",
    projects: [],
    stack: null,
    integrations: [],
  });

  const handleIdentity = useCallback(
    (userName: string, orgName: string) => {
      setState((s) => ({ ...s, userName, orgName }));
      setStage("projects");
    },
    [],
  );

  const handleProjects = useCallback((projects: ProjectEntry[]) => {
    setState((s) => ({ ...s, projects }));
    setStage("stack");
  }, []);

  const handleStack = useCallback((stack: StackPreset) => {
    setState((s) => ({ ...s, stack }));
    setStage("integrations");
  }, []);

  const handleIntegrations = useCallback((integrations: Integration[]) => {
    setState((s) => ({ ...s, integrations }));
    setStage("confirm");
  }, []);

  const handleConfirm = useCallback(() => {
    onComplete({
      userName: state.userName,
      orgName: state.orgName,
      projects: state.projects,
      stack: state.stack!,
      integrations: state.integrations,
      outputDir,
    });
  }, [state, outputDir, onComplete]);

  return (
    <Box flexDirection="column" paddingY={1} paddingX={2}>
      <Header outputDir={outputDir} dryRun={dryRun} />
      {stage === "identity" && <IdentityStage onComplete={handleIdentity} />}
      {stage === "projects" && (
        <ProjectsStage
          userName={state.userName}
          orgName={state.orgName}
          onComplete={handleProjects}
        />
      )}
      {stage === "stack" && (
        <StackStage
          completedFields={{ userName: state.userName, projectCount: state.projects.length }}
          onComplete={handleStack}
        />
      )}
      {stage === "integrations" && (
        <IntegrationsStage stack={state.stack!} onComplete={handleIntegrations} />
      )}
      {stage === "confirm" && (
        <ConfirmStage
          answers={{ ...state, stack: state.stack!, outputDir }}
          onConfirm={handleConfirm}
          onCancel={() => {
            process.stdout.write("\nAborted.\n");
            process.exit(1);
          }}
        />
      )}
    </Box>
  );
}
```

### 6. `Header.tsx`

```tsx
import React from "react";
import { Box, Text } from "ink";

interface HeaderProps {
  outputDir: string;
  dryRun: boolean;
}

export function Header({ outputDir, dryRun }: HeaderProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        grove
      </Text>
      <Text dimColor>Output: {outputDir}</Text>
      {!dryRun && (
        <Text dimColor>Requires: Bun ≥ 1.3.13 · Claude Code CLI authenticated</Text>
      )}
      {dryRun && <Text color="yellow">[dry-run — no files will be written]</Text>}
    </Box>
  );
}
```

### 7. `ReceiptLine.tsx`

Shown above the active prompt to confirm already-collected answers. Uses ink's `<Text>` for terminal-native dimming — no `picocolors` inside ink components.

```tsx
import React from "react";
import { Box, Text } from "ink";

interface ReceiptLineProps {
  label: string;
  value: string;
}

export function ReceiptLine({ label, value }: ReceiptLineProps) {
  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text dimColor>
        {label}: {value}
      </Text>
    </Box>
  );
}
```

### 8. `IdentityStage.tsx`

Sequential two-step: userName then orgName. Renders receipts for confirmed inputs above the active prompt.

```tsx
import React, { useState } from "react";
import { Box, Text } from "ink";
import { TextInput } from "@inkjs/ui";
import { ReceiptLine } from "./ReceiptLine";

interface IdentityStageProps {
  onComplete: (userName: string, orgName: string) => void;
}

export function IdentityStage({ onComplete }: IdentityStageProps) {
  const [step, setStep] = useState<"name" | "org">("name");
  const [userName, setUserName] = useState("");

  const defaultOrg = userName.toLowerCase().replace(/\s+/g, "-") + "-org";

  if (step === "name") {
    return (
      <Box flexDirection="column">
        <Text bold>Your name</Text>
        <TextInput
          placeholder="Alex Chen"
          onSubmit={(value) => {
            if (!value.trim()) return;
            setUserName(value.trim());
            setStep("org");
          }}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <ReceiptLine label="Name" value={userName} />
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text bold>Org name </Text>
          <Text dimColor>(default: {defaultOrg})</Text>
        </Box>
        <TextInput
          placeholder={defaultOrg}
          onSubmit={(value) => onComplete(userName, value.trim() || defaultOrg)}
        />
      </Box>
    </Box>
  );
}
```

### 9. `ProjectsStage.tsx`

Sub-loop: each project collects name → repo → description → priority, then asks whether to add another. The `projects` array grows until the user declines.

```tsx
import React, { useState } from "react";
import { Box, Text } from "ink";
import { TextInput, Select, ConfirmInput } from "@inkjs/ui";
import { ReceiptLine } from "./ReceiptLine";
import type { ItemPriority, ProjectEntry } from "../types";

type ProjectStep = "name" | "repo" | "desc" | "priority" | "more";

interface ProjectDraft {
  name: string;
  repoPath: string;
  description: string;
  priority: ItemPriority | null;
}

interface ProjectsStageProps {
  userName: string;
  orgName: string;
  onComplete: (projects: ProjectEntry[]) => void;
}

export function ProjectsStage({ userName, orgName, onComplete }: ProjectsStageProps) {
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [step, setStep] = useState<ProjectStep>("name");
  const [draft, setDraft] = useState<ProjectDraft>({
    name: "",
    repoPath: "",
    description: "",
    priority: null,
  });

  const commitProject = (priority: ItemPriority) => {
    const newProjects = [
      ...projects,
      {
        name: draft.name,
        repoPath: draft.repoPath,
        description: draft.description,
        priority,
      },
    ];
    setProjects(newProjects);
    setDraft({ name: "", repoPath: "", description: "", priority: null });
    setStep("more");
  };

  return (
    <Box flexDirection="column">
      {projects.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {projects.map((p) => (
            <ReceiptLine key={p.name} label="Project" value={`${p.name} (${p.priority})`} />
          ))}
        </Box>
      )}

      {step === "name" && (
        <Box flexDirection="column">
          <Text bold>
            {projects.length === 0 ? "First project name" : "Next project name"}
          </Text>
          <TextInput
            placeholder="my-app"
            onSubmit={(v) => {
              if (!v.trim()) return;
              setDraft((d) => ({ ...d, name: v.trim() }));
              setStep("repo");
            }}
          />
        </Box>
      )}

      {step === "repo" && (
        <Box flexDirection="column">
          <ReceiptLine label="Project" value={draft.name} />
          <Box marginTop={1} flexDirection="column">
            <Text bold>Absolute path to repo</Text>
            <TextInput
              placeholder="/home/you/dev/my-app"
              onSubmit={(v) => {
                if (!v.trim()) return;
                setDraft((d) => ({ ...d, repoPath: v.trim() }));
                setStep("desc");
              }}
            />
          </Box>
        </Box>
      )}

      {step === "desc" && (
        <Box flexDirection="column">
          <ReceiptLine label="Project" value={draft.name} />
          <Box marginTop={1} flexDirection="column">
            <Box>
              <Text bold>Description </Text>
              <Text dimColor>(optional — Enter to skip)</Text>
            </Box>
            <TextInput
              placeholder="REST API for team sprints"
              onSubmit={(v) => {
                setDraft((d) => ({ ...d, description: v.trim() }));
                setStep("priority");
              }}
            />
          </Box>
        </Box>
      )}

      {step === "priority" && (
        <Box flexDirection="column">
          <ReceiptLine label="Project" value={draft.name} />
          <Box marginTop={1} flexDirection="column">
            <Text bold>Priority</Text>
            <Select
              options={[
                { label: "P0 — production / on fire", value: "p0" },
                { label: "P1 — active development", value: "p1" },
                { label: "P2 — scheduled", value: "p2" },
                { label: "P3 — backlog", value: "p3" },
              ]}
              onChange={(v) => commitProject(v as ItemPriority)}
            />
          </Box>
        </Box>
      )}

      {step === "more" && (
        <Box flexDirection="column">
          <Box marginTop={1} flexDirection="column">
            <Text bold>Add another project?</Text>
            <ConfirmInput
              onConfirm={() => setStep("name")}
              onCancel={() => onComplete(projects)}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}
```

### 10. `StackStage.tsx`

```tsx
import React from "react";
import { Box, Text } from "ink";
import { Select } from "@inkjs/ui";
import { ReceiptLine } from "./ReceiptLine";
import type { StackPreset } from "../types";

interface StackStageProps {
  completedFields: { userName: string; projectCount: number };
  onComplete: (stack: StackPreset) => void;
}

export function StackStage({ completedFields, onComplete }: StackStageProps) {
  return (
    <Box flexDirection="column">
      <ReceiptLine label="Name" value={completedFields.userName} />
      <ReceiptLine
        label="Projects"
        value={String(completedFields.projectCount)}
      />
      <Box marginTop={1} flexDirection="column">
        <Text bold>Convention preset</Text>
        <Select
          options={[
            { label: "Bun / TypeScript / React", value: "bun-ts" },
            { label: "Rust / Actix-web / Tokio", value: "rust" },
            { label: "Generic (stack-neutral)", value: "generic" },
            { label: "Docker / Linux deployment", value: "docker-linux" },
            { label: "Design system (VOID architecture)", value: "design-system" },
            { label: "Turborepo monorepo", value: "turborepo" },
          ]}
          onChange={(v) => onComplete(v as StackPreset)}
        />
      </Box>
    </Box>
  );
}
```

### 11. `IntegrationsStage.tsx`

```tsx
import React from "react";
import { Box, Text } from "ink";
import { MultiSelect } from "@inkjs/ui";
import { ReceiptLine } from "./ReceiptLine";
import type { Integration, StackPreset } from "../types";

interface IntegrationsStageProps {
  stack: StackPreset;
  onComplete: (integrations: Integration[]) => void;
}

export function IntegrationsStage({ stack, onComplete }: IntegrationsStageProps) {
  return (
    <Box flexDirection="column">
      <ReceiptLine label="Stack" value={stack} />
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text bold>Integrations </Text>
          <Text dimColor>(space to toggle, Enter to confirm or skip)</Text>
        </Box>
        <MultiSelect
          options={[
            { label: "Jira — ticket sync via MCP", value: "jira" },
            { label: "GitLab — MR creation, pipeline status via MCP", value: "gitlab" },
            { label: "Figma — design spec access via MCP", value: "figma" },
          ]}
          onSubmit={(values) => onComplete(values as Integration[])}
        />
      </Box>
    </Box>
  );
}
```

### 12. `ConfirmStage.tsx`

Summary of all collected answers, then a `ConfirmInput` for final yes/no.

```tsx
import React from "react";
import { Box, Text } from "ink";
import { ConfirmInput } from "@inkjs/ui";
import type { Integration, ProjectEntry, StackPreset } from "../types";

interface ConfirmStageProps {
  answers: {
    userName: string;
    orgName: string;
    projects: ProjectEntry[];
    stack: StackPreset;
    integrations: Integration[];
    outputDir: string;
  };
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmStage({ answers, onConfirm, onCancel }: ConfirmStageProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <SummaryRow label="Name" value={answers.userName} />
        <SummaryRow label="Org" value={answers.orgName} />
        <SummaryRow
          label="Projects"
          value={answers.projects.map((p) => `${p.name} (${p.priority})`).join(", ")}
        />
        <SummaryRow label="Stack" value={answers.stack} />
        <SummaryRow
          label="Integrations"
          value={answers.integrations.length > 0 ? answers.integrations.join(", ") : "none"}
        />
        <SummaryRow label="Output" value={answers.outputDir} />
      </Box>
      <Box marginTop={1}>
        <Text bold>Create your engineering org? </Text>
        <ConfirmInput onConfirm={onConfirm} onCancel={onCancel} />
      </Box>
    </Box>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Box width={14}>
        <Text dimColor>{label}</Text>
      </Box>
      <Text>{value}</Text>
    </Box>
  );
}
```

### 13. `picocolors` usage rules

`picocolors` is used only **outside** the ink render tree — in `index.ts` for the usage banner, and in `scaffold.ts` for progress output. Inside ink components, use ink's `<Text color="..." dimColor bold>` props exclusively. Mixing picocolors escape codes with ink's output pipeline corrupts the terminal layout.

| Context | Styling tool |
|---|---|
| Usage/help banner (`index.ts`) | `picocolors` |
| Ctrl+C cancellation message (process SIGINT handler) | `picocolors` |
| Scaffold progress (`scaffold.ts`) | `picocolors` |
| All ink components (`*.tsx` in `components/`) | ink `<Text>` props only |

## File Structure

```
src/
├── index.ts                    updated — picocolors banner, runWizard call
├── types.ts                    updated — WizardOptions added
├── templates.ts                unchanged
├── scaffold.ts                 unchanged (still stub)
├── wizard.tsx                  runWizard() — ink render() wrapper
└── components/
    ├── WizardApp.tsx           stage state machine, onComplete callback
    ├── Header.tsx              banner + output path
    ├── ReceiptLine.tsx         ✓ confirmed-field row
    ├── IdentityStage.tsx       userName + orgName
    ├── ProjectsStage.tsx       project sub-loop
    ├── StackStage.tsx          stack Select
    ├── IntegrationsStage.tsx   MultiSelect
    └── ConfirmStage.tsx        summary + ConfirmInput
```

## Acceptance Criteria

- [ ] `bun run packages/create-grove/src/index.ts test-out --dry-run` launches the ink TUI wizard
- [ ] The wizard header shows the output path in dim text and a `[dry-run]` badge when `--dry-run` is active
- [ ] Each confirmed answer appears as a `✓ field: value` receipt line above the next prompt
- [ ] The `ConfirmStage` renders a bordered summary box with all collected answers before asking yes/no
- [ ] Ctrl+C at any prompt prints `Cancelled.` in yellow and exits with code 1
- [ ] Answering "N" at the final confirm prompt prints `Aborted.` and exits with code 1
- [ ] `--dry-run` output after confirmation is valid JSON parseable by `JSON.parse()`
- [ ] `--dry-run` output contains all keys: `userName`, `orgName`, `projects`, `stack`, `integrations`, `outputDir`
- [ ] `projects` in dry-run output has at least one entry with `name`, `repoPath`, `description`, `priority`
- [ ] `stack` in dry-run output is one of: `"bun-ts"`, `"rust"`, `"generic"`, `"docker-linux"`, `"design-system"`, `"turborepo"`
- [ ] Pressing Enter on an empty `userName` field does not advance — validation holds
- [ ] `bun run typecheck` at repo root exits 0

## Dependencies

- SPEC_02 (package scaffold, types, `wizard.tsx` stub)

## Verification

```bash
# Interactive dry-run — complete the wizard, then verify output
bun run packages/create-grove/src/index.ts test-out --dry-run | \
  bun -e "
    let raw = '';
    process.stdin.on('data', d => raw += d);
    process.stdin.on('end', () => {
      const obj = JSON.parse(raw.split('--- dry-run output ---\n')[1]);
      const required = ['userName','orgName','projects','stack','integrations','outputDir'];
      required.forEach(k => {
        if (!(k in obj)) { console.error('FAIL: missing', k); process.exit(1); }
      });
      if (!Array.isArray(obj.projects) || obj.projects.length === 0) {
        console.error('FAIL: projects empty'); process.exit(1);
      }
      const validStacks = ['bun-ts','rust','generic','docker-linux','design-system','turborepo'];
      if (!validStacks.includes(obj.stack)) {
        console.error('FAIL: invalid stack', obj.stack); process.exit(1);
      }
      console.log('PASS');
    });
  "

# typecheck
bun run typecheck
echo "Exit: $?"   # expect 0

# No picocolors calls inside component files
grep -rn "picocolors\|from 'picocolors'" \
  packages/create-grove/src/components/ \
  && echo "FAIL: picocolors in component files" || echo "PASS"
```
