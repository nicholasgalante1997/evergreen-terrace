import { concurrent_build } from "@evergreen-terrace/build-utils"
import type { BuildConfig } from "bun"

await concurrent_build({
  entrypoints: ["src/index.ts"],
  outdir: "./dist",
  target: "browser",
  format: "esm",
  packages: "external",
  sourcemap: "linked"
} as BuildConfig)
