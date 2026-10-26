import { confirm } from '@inquirer/prompts';
import { createInterface } from 'node:readline';

const c = {
  reset: '\x1b[0m',
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
};

function print(s = '') {
  process.stdout.write(s + '\n');
}

function hr() {
  print(c.dim('─'.repeat(72)));
}

function header(floor: number, title: string) {
  print();
  hr();
  print(c.bold(c.cyan(`  FLOOR ${floor}  ·  ${title}`)));
  hr();
  print();
}

function code(lines: string[]) {
  print(c.dim('  ┌'));
  for (const line of lines) {
    print(c.dim('  │  ') + line);
  }
  print(c.dim('  └'));
  print();
}

function table(rows: [string, string, string][], headers: [string, string, string]) {
  const w0 = Math.max(headers[0].length, ...rows.map((r) => r[0].length)) + 2;
  const w1 = Math.max(headers[1].length, ...rows.map((r) => r[1].length)) + 2;
  const row = (a: string, b: string, c_: string) =>
    `  │ ${a.padEnd(w0)} ${b.padEnd(w1)} ${c_}`;
  const sep = `  ├─${'─'.repeat(w0 + 1)}─${'─'.repeat(w1 + 1)}─`;
  print(`  ┌─${'─'.repeat(w0 + 1)}─${'─'.repeat(w1 + 1)}─`);
  print(row(c.bold(headers[0]), c.bold(headers[1]), c.bold(headers[2])));
  print(sep);
  for (const r of rows) {
    print(row(r[0], r[1], r[2]));
  }
  print(`  └─${'─'.repeat(w0 + 1)}─${'─'.repeat(w1 + 1)}─`);
  print();
}

async function advance(label = 'Continue') {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    rl.question(c.dim(`  [ ${label} — press Enter ] `), () => {
      rl.close();
      resolve();
    });
  });
  print();
}

async function checkpoint(task: string) {
  print(c.yellow('  ✦ CHECKPOINT'));
  print(`  ${task}`);
  print();
  await confirm({ message: 'Mark as complete and continue?' });
  print();
}

async function floor0() {
  header(0, 'THE KEEP');
  print('  Your grove runs five services. Start them before anything else.');
  print();
  code(['bun run start']);
  table(
    [
      ['queue-server', '2727', 'Work queue (read/write)'],
      ['web', '2728', 'Dashboard — http://localhost:2728'],
      ['metrics', '2729', 'Activity tracking'],
      ['sentinel', '2730', 'The Watchtower'],
      ['conductor', '2731', 'Dispatch engine'],
    ],
    ['SERVICE', 'PORT', 'PURPOSE'],
  );
  print('  Each service restarts automatically if it crashes. You can watch');
  print('  streamed logs with:');
  print();
  code(['bun run logs']);
  await checkpoint('Run `bun run start`. All five services should report [ready].');
}

async function floor1() {
  header(1, 'THE PARTY');
  print('  Eight agents were registered to ~/.claude/agents/ during setup.');
  print('  They are available in any Claude Code session, in any directory.');
  print();
  table(
    [
      ['pm', 'Scribe', 'PRDs, queue items, backlog grooming'],
      ['eng-senior', 'Archmage', 'Architecture, ADRs, PR review'],
      ['eng-mid', 'Journeyman', 'Feature implementation from spec'],
      ['eng-junior', 'Apprentice', 'Boilerplate, scaffolding, tests'],
      ['director', 'Inquisitor', 'Scope pressure, prioritization challenges'],
      ['voice', 'Bard', 'Rewrites output in your register'],
      ['stakeholder', 'Herald', 'Translates technical work for business audiences'],
      ['momentum-sentinel', 'Watcher', 'Cross-project health and momentum'],
    ],
    ['AGENT', 'CLASS', 'PURPOSE'],
  );
  print('  To invoke an agent from a Claude Code session, type its name:');
  print();
  code(['/momentum-sentinel', '/pm "Draft a quest for adding search to the dashboard"']);
  print('  To dispatch an agent non-interactively from your grove root:');
  print();
  code(['bun run dispatch --agent pm --task "Write a PRD for the metrics endpoint"']);
  await checkpoint(
    'Open a Claude Code session and invoke /momentum-sentinel. Read the output.',
  );
}

async function floor2() {
  header(2, 'THE QUEST BOARD');
  print('  All work flows through queue/inbox/. Each item is a TOML file.');
  print('  The conductor reads from inbox, moves items to active/, then completed/.');
  print();
  code([
    '[item]',
    'id = "a1b2c3d4-..."',
    'title = "Add rate limiting to queue-server"',
    'project = "my-project"',
    'type = "feature"       # feature | bug | research | design | pm | ops',
    'priority = "p1"        # p0 | p1 | p2 | p3',
    'created = "2026-05-12T00:00:00Z"',
    'source = "manual"',
    '',
    '[context]',
    'description = "..."',
    'acceptance = "..."',
    'links = []',
  ]);
  print('  Three ways to add a quest:');
  print();
  print(c.bold('  1. PM companion') + c.dim(' — recommended for rough ideas'));
  code(['/pm "I want a command that shows all agents sorted by last used"']);
  print(c.bold('  2. TUI') + c.dim(' — quick additions'));
  code(['bun run tui', '# navigate to: Quest Board → New Quest']);
  print(c.bold('  3. CLI') + c.dim(' — guided prompts'));
  code(['bun run queue:add']);
  print();
  print('  Priority:');
  print(c.dim('    p0 ─── on fire, drop everything'));
  print(c.dim('    p1 ─── active development, on deck'));
  print(c.dim('    p2 ─── scheduled'));
  print(c.dim('    p3 ─── backlog'));
  print();
  await checkpoint('Add your first quest. Let /pm write the TOML if the idea is still rough.');
}

async function floor3() {
  header(3, 'THE WATCHTOWER');
  print('  The Sentinel runs on a schedule and monitors all registered projects.');
  print('  It scores momentum by git velocity, queue depth, and agent activity.');
  print('  Reports land in context/metrics/.');
  print();
  print('  Run a scan now:');
  print();
  code(['bun run sentinel:report']);
  print('  Sample output:');
  print();
  code([
    '┌───────────────────────────────────────────────┐',
    '│  SENTINEL REPORT — 2026-05-12                 │',
    '├──────────────────┬────────────┬───────────────┤',
    '│  my-api          │  HIGH      │  2h ago       │',
    '│  my-frontend     │  MED       │  3d ago       │',
    '│  old-project     │  LOW       │  12d ago      │',
    '├──────────────────┴────────────┴───────────────┤',
    '│  FOCUS: my-frontend                           │',
    '│  STALE QUESTS: 2 items older than 7 days      │',
    '└───────────────────────────────────────────────┘',
  ]);
  print();
  print('  Set the scan interval in .env:');
  print();
  code(['SENTINEL_INTERVAL_HOURS=6']);
  print('  The momentum-sentinel agent reads the latest report and gives a');
  print('  conversational summary. Invoke it from any Claude Code session.');
  print();
  await checkpoint('Run `bun run sentinel:report`. Check which project has lowest momentum.');
}

async function floor4() {
  header(4, 'THE CONDUCTOR');
  print('  The conductor takes a quest from queue/inbox/, assigns an agent,');
  print('  builds their context window, and runs them non-interactively.');
  print();
  print('  Dispatch a single quest:');
  print();
  code(['bun run dispatch --quest queue/inbox/my-quest.toml']);
  print('  Override the assigned agent:');
  print();
  code(['bun run dispatch --quest queue/inbox/my-quest.toml --agent eng-senior']);
  print('  Clear the inbox by priority:');
  print();
  code(['bun run dispatch:batch --priority p0,p1']);
  print('  Check what is in flight:');
  print();
  code(['bun run conductor:status']);
  print('  Completed quests move to queue/completed/. The agent\'s output is');
  print('  appended to the TOML under [result]. Review it there.');
  print();
  await checkpoint(
    'Dispatch the quest you added in Floor 2. Watch conductor:status. Read the result.',
  );
}

async function floor5() {
  header(5, 'THE VOICE PACT');
  print('  The voice agent starts empty. It learns your register from');
  print('  skills/voice/SKILL.md.');
  print();
  print('  Open the file and fill in three sections:');
  print();
  code([
    '## Register',
    '# 2-3 sentences describing your writing style and tone.',
    '',
    '## Samples',
    '# Paste 2-3 things you have actually written.',
    '# Slack messages, docs, PR descriptions — anything that sounds like you.',
    '',
    '## Anti-patterns',
    '# List phrases that sound wrong in AI output.',
    '# e.g. "leverage", "it\'s worth noting", "I hope this finds you well"',
  ]);
  print('  After editing, sync all agents:');
  print();
  code(['bun run sync-agents']);
  print('  Test it:');
  print();
  code(['/voice "Explain why we switched from Express to Bun.serve() in one paragraph"']);
  print();
  await checkpoint('Fill in skills/voice/SKILL.md and run bun run sync-agents.');
}

async function summary() {
  print();
  hr();
  print(c.bold(c.cyan('  SETUP COMPLETE')));
  hr();
  print();
  print('  The full loop:');
  print();
  print(`  ${c.dim('1.')} ${c.cyan('/momentum-sentinel')}     ${c.dim('— find what needs attention')}`);
  print(`  ${c.dim('2.')} ${c.cyan('/pm "..."')}              ${c.dim('— write a quest for the top priority')}`);
  print(`  ${c.dim('3.')} ${c.cyan('bun run dispatch:batch')}  ${c.dim('— dispatch p0 + p1 items')}`);
  print(`  ${c.dim('4.')} ${c.cyan('bun run conductor:status')} ${c.dim('— monitor what is in flight')}`);
  print(`  ${c.dim('5.')} ${c.dim('review queue/completed/')}  ${c.dim('— read agent output')}`);
  print(`  ${c.dim('6.')} ${c.cyan('/voice "..."')}            ${c.dim('— polish external-facing output')}`);
  print();
  print(c.dim('  Quick reference:'));
  print(c.dim('    bun run start          wake all services'));
  print(c.dim('    bun run tui            terminal dashboard'));
  print(c.dim('    bun run sentinel:report  run a scan now'));
  print(c.dim('    bun run sync-agents    push agent changes to ~/.claude/agents/'));
  print();
}

async function run() {
  print();
  print(c.bold(c.cyan('  GROVE  ·  Getting Started')));
  print(c.dim('  Work through the floors in order. Each one has a checkpoint.'));
  print();

  const floors = [floor0, floor1, floor2, floor3, floor4, floor5];
  const names = [
    'The Keep',
    'The Party',
    'The Quest Board',
    'The Watchtower',
    'The Conductor',
    'The Voice Pact',
  ];

  for (let i = 0; i < floors.length; i++) {
    const skip = await confirm({
      message: `Floor ${i} — ${names[i]}. Ready?`,
      default: true,
    });
    if (!skip) {
      print(c.dim('  Skipped.'));
      print();
      continue;
    }
    await floors[i]!();
    await advance('Next floor');
  }

  await summary();
}

run().catch((err: unknown) => {
  if (err instanceof Error && err.message.includes('force closed')) {
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});
