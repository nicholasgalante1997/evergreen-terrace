import { checkbox, confirm, input, select } from '@inquirer/prompts';
import pc from 'picocolors';
import type {
  Integration,
  ItemPriority,
  ProjectEntry,
  StackPreset,
  WizardAnswers,
  WizardOptions,
} from './types';

export async function runWizard(outputDir: string, _options: WizardOptions): Promise<WizardAnswers> {
  console.log('\n' + pc.bold(pc.cyan('  grove')));
  console.log(pc.dim(`  Output: ${outputDir}\n`));

  const userName = await input({
    message: 'Your name',
    validate: (v) => v.trim() !== '' || 'Required',
  });

  const defaultOrg = userName.toLowerCase().replace(/\s+/g, '-') + '-org';
  const orgInput = await input({ message: 'Org name', default: defaultOrg });
  const orgName = orgInput.trim() || defaultOrg;

  const projects: ProjectEntry[] = [];
  let collecting = true;

  while (collecting) {
    const label = projects.length === 0 ? 'First project name' : 'Next project name';
    const name = await input({ message: label, validate: (v) => v.trim() !== '' || 'Required' });
    const repoPath = await input({
      message: 'Absolute path to repo',
      validate: (v) => v.trim() !== '' || 'Required',
    });
    const description = await input({ message: 'Description (optional)' });
    const priority = await select<ItemPriority>({
      message: 'Priority',
      choices: [
        { name: 'P0 — production / on fire', value: 'p0' },
        { name: 'P1 — active development', value: 'p1' },
        { name: 'P2 — scheduled', value: 'p2' },
        { name: 'P3 — backlog', value: 'p3' },
      ],
    });
    projects.push({ name: name.trim(), repoPath: repoPath.trim(), description: description.trim(), priority });
    collecting = await confirm({ message: 'Add another project?', default: false });
  }

  const stack = await select<StackPreset>({
    message: 'Convention preset',
    choices: [
      { name: 'Bun / TypeScript / React', value: 'bun-ts' },
      { name: 'Rust / Actix-web / Tokio', value: 'rust' },
      { name: 'Generic (stack-neutral)', value: 'generic' },
      { name: 'Docker / Linux deployment', value: 'docker-linux' },
      { name: 'Design system (VOID architecture)', value: 'design-system' },
      { name: 'Turborepo monorepo', value: 'turborepo' },
    ],
  });

  const integrations = await checkbox<Integration>({
    message: 'Integrations (space to toggle, Enter to confirm)',
    choices: [
      { name: 'Jira — ticket sync via MCP', value: 'jira' },
      { name: 'GitLab — MR creation, pipeline status via MCP', value: 'gitlab' },
      { name: 'Figma — design spec access via MCP', value: 'figma' },
    ],
  });

  console.log('\n' + pc.dim('  Summary'));
  const rows: [string, string][] = [
    ['Name', userName],
    ['Org', orgName],
    ['Projects', projects.map((p) => `${p.name} (${p.priority})`).join(', ')],
    ['Stack', stack],
    ['Integrations', integrations.length > 0 ? integrations.join(', ') : 'none'],
    ['Output', outputDir],
  ];
  for (const [label, value] of rows) {
    console.log(`  ${pc.dim(label.padEnd(14))}${value}`);
  }
  console.log();

  const confirmed = await confirm({ message: 'Create your engineering org?' });
  if (!confirmed) {
    console.log(pc.yellow('\nAborted.'));
    process.exit(1);
  }

  return { userName, orgName, projects, stack, integrations, outputDir };
}
