import { concurrent_build } from "@evergreen-terrace/build-utils"
import type { BuildConfig } from "bun"

const shared: Partial<BuildConfig> = {
  outdir: "./dist",
  format: "esm",
  packages: "external",
  sourcemap: "linked"
}

await concurrent_build(
  { ...shared, entrypoints: ["src/index.ts"], target: "browser" } as BuildConfig,
  { ...shared, entrypoints: ["src/logger.ts"], target: "bun" } as BuildConfig
)
