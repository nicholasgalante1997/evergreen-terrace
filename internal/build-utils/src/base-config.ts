import type { BuildConfig } from "bun";

export interface BaseConfigOptions {
  external?: string[];
  outdir?: string;
}

export function createBaseConfig(options: BaseConfigOptions = {}): Partial<BuildConfig> {
  const { external = [], outdir = "./dist" } = options;
  return {
    outdir,
    format: "esm",
    splitting: false,
    sourcemap: "linked",
    minify: false,
    packages: "external",
    external,
  };
}
