import { createBaseConfig } from './base';

const base = createBaseConfig({ outdir: 'dist' });

const results = await Promise.all([
  Bun.build({ ...base, entrypoints: ['src/index.ts'] } as Bun.BuildConfig),
  Bun.build({ ...base, entrypoints: ['src/onboarding.ts'] } as Bun.BuildConfig),
]);

let failed = false;
for (const result of results) {
  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    failed = true;
  }
}

if (failed) process.exit(1);

const total = results.reduce((n, r) => n + r.outputs.length, 0);
console.log(`[grove] built ${total} file(s)`);
