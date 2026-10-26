import { resolve } from 'node:path';
import cac from 'cac';
import pc from 'picocolors';
import { runWizard } from './wizard';
import { scaffold } from './scaffold';

export const TEMPLATES_DIR = new URL('../templates', import.meta.url).pathname;

const cli = cac('create-grove');

cli
  .command('[output-dir]', 'Scaffold a personal engineering org')
  .option('--dry-run', 'Run wizard without writing files; print collected answers as JSON')
  .action(async (outputDir: string | undefined, options: { dryRun: boolean }) => {
    if (!outputDir) {
      cli.outputHelp();
      process.exit(1);
    }
    const resolved = resolve(process.cwd(), outputDir);
    const answers = await runWizard(resolved, { dryRun: options.dryRun });

    if (options.dryRun) {
      console.log(pc.dim('\n--- dry-run output ---'));
      console.log(JSON.stringify(answers, null, 2));
      process.exit(0);
    }

    await scaffold(answers);
  });

cli.help();
cli.version('0.1.0');
cli.parse();
