import { concurrent_build } from "@evergreen-terrace/build-utils";
import base from "./base";
import type { BuildConfig } from "bun";

await concurrent_build({
  ...base,
  entrypoints: ["src/index.ts"],
  target: "bun",
  naming: { entry: "index.js" },
} as BuildConfig);
