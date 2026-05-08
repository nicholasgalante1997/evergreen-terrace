import type { BuildConfig, BuildOutput } from "bun";

export async function concurrent_build(...configs: BuildConfig[]): Promise<BuildOutput[]> {
  const start = performance.now();
  const outputs = await Promise.all(configs.map((c) => Bun.build({ ...c, metafile: true })));

  for (const output of outputs) {
    if (!output.success) {
      console.error("Build errors:", output.logs);
      throw new Error("Build produced errors");
    }
  }

  console.log(`Built ${configs.length} bundle(s) in ${(performance.now() - start).toFixed(2)}ms`);
  return outputs;
}
