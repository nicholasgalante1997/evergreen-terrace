import pc from "picocolors";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { cp } from "node:fs/promises";
import type { WizardAnswers } from "./types";
import { render, type TokenMap } from "./templates";
import { TEMPLATES_DIR } from "./index";

const REPO_URL = "https://github.com/nicholasgalante1997/evergreen-terrace.git";

// Personal and runtime files that must not appear in consumer output.
// Adding a personal skill to the repo requires also adding it to this list.
const EXCLUDE: Set<string> = new Set([
  "context/projects",
  "skills/nick-voice",
  "skills/nick-conventions",
  "skills/bundt-context",
  "skills/foresight-context",
  "steering/project-context.md",
  "queue/inbox",
  "queue/active",
  "queue/completed",
  "packages/create-grove",
  ".git",
  "node_modules",
  ".turbo",
  "bun.lock",
  "specs",
  "USER_MANUAL.md",
  ".env",
  ".env.local",
  "context/beads",
  "context/metrics",
]);

const STACK_SUMMARIES: Record<string, string> = {
  "bun-ts": "Bun runtime. TypeScript strict mode. React 19 for UI. Turbo for monorepo.",
  rust: "Rust with Tokio async. Actix-web for HTTP. sqlx for PostgreSQL. thiserror/anyhow for errors.",
  generic:
    "Language-neutral conventions: strict types, explicit error handling, async-first, no magic numbers.",
  "docker-linux": "Docker multi-stage builds, compose orchestration, Linux deployment, health checks.",
  "design-system":
    "VOID design system: BEM + CSS custom properties, Container/View split, Storybook CSF3.",
  turborepo:
    "Turborepo monorepo: apps/packages/internal layout, concurrent_build, createBaseConfig, changesets.",
};

export async function scaffold(answers: WizardAnswers): Promise<void> {
  console.log(pc.dim(`\n  Creating ${answers.outputDir}...`));

  await mkdir(answers.outputDir, { recursive: true });

  const { dir: srcRoot, cleanup } = await cloneSource();

  try {
    process.stdout.write(pc.dim("  Copying infrastructure..."));
    await copyInfrastructure(srcRoot, answers.outputDir);
    process.stdout.write(pc.green(" done\n"));

    process.stdout.write(pc.dim("  Generating personal context..."));
    await generateContext(answers, answers.outputDir);
    process.stdout.write(pc.green(" done\n"));

    await postScaffold(answers.outputDir);
    printNextSteps(answers);
  } finally {
    await cleanup();
  }
}

async function cloneSource(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const tmp = await mkdtemp(join(tmpdir(), "et-source-"));
  process.stdout.write(pc.dim("  Cloning infrastructure..."));
  const proc = Bun.spawnSync(
    ["git", "clone", "--depth=1", "--single-branch", REPO_URL, tmp],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (proc.exitCode !== 0) {
    const err = new TextDecoder().decode(proc.stderr);
    process.stdout.write(pc.red(" failed\n"));
    throw new Error(`git clone failed: ${err}`);
  }
  process.stdout.write(pc.green(" done\n"));
  return {
    dir: tmp,
    cleanup: () => rm(tmp, { recursive: true, force: true }),
  };
}

function shouldExclude(relativePath: string): boolean {
  for (const excluded of EXCLUDE) {
    if (relativePath === excluded || relativePath.startsWith(excluded + "/")) {
      return true;
    }
  }
  return false;
}

async function copyInfrastructure(srcRoot: string, destRoot: string): Promise<void> {
  const entries = await Array.fromAsync(
    new Bun.Glob("*").scan({ cwd: srcRoot, onlyFiles: false }),
  );

  for (const entry of entries) {
    if (shouldExclude(entry)) continue;

    const srcPath = join(srcRoot, entry);
    const destPath = join(destRoot, entry);

    await cp(srcPath, destPath, {
      recursive: true,
      filter: (src) => {
        const rel = src.replace(srcRoot + "/", "");
        return !shouldExclude(rel);
      },
    });
  }
}

async function generateContext(answers: WizardAnswers, destRoot: string): Promise<void> {
  await generateSteering(answers, destRoot);
  await generateSkills(answers, destRoot);
  await generateProjects(answers, destRoot);
  await generateAgentConfigs(destRoot);
  await generateEnv(answers, destRoot);
  await generateQueueDirs(destRoot);
}

async function generateSteering(answers: WizardAnswers, destRoot: string): Promise<void> {
  const projectsListMd = answers.projects
    .map(
      (p) =>
        `**${p.name}** (\`${p.repoPath}\`) — ${p.description || "No description provided."}. Priority: ${p.priority}.`,
    )
    .join("\n\n");

  const stackSummary = STACK_SUMMARIES[answers.stack] ?? answers.stack;

  const tokens: TokenMap = {
    USER_NAME: answers.userName,
    ORG_NAME: answers.orgName,
    PROJECTS_LIST: projectsListMd,
    STACK_SUMMARY: stackSummary,
  };

  const template = await Bun.file(join(TEMPLATES_DIR, "steering/project-context.md")).text();
  const rendered = render(template, tokens);

  await mkdir(join(destRoot, "steering"), { recursive: true });
  await Bun.write(join(destRoot, "steering/project-context.md"), rendered);
}

async function generateSkills(answers: WizardAnswers, destRoot: string): Promise<void> {
  const voiceTemplate = await Bun.file(
    join(TEMPLATES_DIR, "skills/voice/SKILL.md"),
  ).text();
  const voiceRendered = render(voiceTemplate, { USER_NAME: answers.userName });

  await mkdir(join(destRoot, "skills/voice"), { recursive: true });
  await Bun.write(join(destRoot, "skills/voice/SKILL.md"), voiceRendered);

  const conventionsFile = `SKILL.${answers.stack}.md`;
  const conventionsSrc = join(TEMPLATES_DIR, "skills/conventions", conventionsFile);
  const conventionsDest = join(destRoot, "skills/conventions/SKILL.md");

  await mkdir(join(destRoot, "skills/conventions"), { recursive: true });
  await Bun.write(conventionsDest, await Bun.file(conventionsSrc).text());
}

async function generateProjects(answers: WizardAnswers, destRoot: string): Promise<void> {
  const template = await Bun.file(join(TEMPLATES_DIR, "context/project.toml")).text();
  const today = new Date().toISOString().split("T")[0] ?? new Date().toISOString();

  await mkdir(join(destRoot, "context/projects"), { recursive: true });

  for (const project of answers.projects) {
    const tokens: TokenMap = {
      PROJECT_NAME: project.name,
      PROJECT_REPO: project.repoPath,
      PROJECT_DESCRIPTION: project.description,
      PROJECT_PRIORITY: project.priority,
      TODAY: today,
    };
    const rendered = render(template, tokens);
    await Bun.write(join(destRoot, `context/projects/${project.name}.toml`), rendered);
  }
}

async function generateAgentConfigs(destRoot: string): Promise<void> {
  const overridesDir = join(TEMPLATES_DIR, "agents/overrides");
  const overrides = await Array.fromAsync(new Bun.Glob("*.json").scan({ cwd: overridesDir }));

  for (const file of overrides) {
    const roleName = file.replace(".json", "");
    const src = join(overridesDir, file);
    const dest = join(destRoot, "agents", roleName, "agent.json");
    await mkdir(join(destRoot, "agents", roleName), { recursive: true });
    await Bun.write(dest, await Bun.file(src).text());
  }
}

async function generateEnv(answers: WizardAnswers, destRoot: string): Promise<void> {
  const content = `QUEUE_ROOT=${destRoot}\n`;
  await Bun.write(join(destRoot, ".env"), content);
}

async function generateQueueDirs(destRoot: string): Promise<void> {
  await mkdir(join(destRoot, "queue/inbox"), { recursive: true });
  await mkdir(join(destRoot, "queue/active"), { recursive: true });
  await mkdir(join(destRoot, "queue/completed"), { recursive: true });
  await Bun.write(join(destRoot, "queue/inbox/.gitkeep"), "");
  await Bun.write(join(destRoot, "queue/active/.gitkeep"), "");
  await Bun.write(join(destRoot, "queue/completed/.gitkeep"), "");
}

async function postScaffold(destRoot: string): Promise<void> {
  process.stdout.write(pc.dim("  Installing dependencies..."));
  const install = Bun.spawnSync(["bun", "install"], {
    cwd: destRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (install.exitCode !== 0) {
    process.stdout.write(pc.red(" failed\n"));
    const err = new TextDecoder().decode(install.stderr);
    throw new Error(`bun install failed: ${err}`);
  }
  process.stdout.write(pc.green(" done\n"));

  process.stdout.write(pc.dim("  Registering agents with Claude Code..."));
  const sync = Bun.spawnSync(["bun", "run", "sync-agents"], {
    cwd: destRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (sync.exitCode !== 0) {
    process.stdout.write(
      pc.yellow(" skipped") + pc.dim(" (run manually: bun run sync-agents)\n"),
    );
  } else {
    process.stdout.write(pc.green(" done\n"));
  }
}

function printNextSteps(answers: WizardAnswers): void {
  console.log("\n" + pc.bold(pc.green("  Your engineering org is ready.\n")));
  console.log(pc.dim("  Location: ") + answers.outputDir + "\n");
  console.log(pc.bold("  Start here:"));
  console.log(pc.cyan("    bunx grove-onboarding") + pc.dim("    # interactive getting started guide"));
  console.log(pc.cyan(`    cd ${answers.outputDir}`));
  console.log(pc.cyan("    bun run start") + pc.dim("            # start all services\n"));
  console.log(pc.dim("  Agents registered in ~/.claude/agents/"));
  console.log(pc.dim("  Open any project in Claude Code — your party is ready.\n"));
}
