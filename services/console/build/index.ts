/** @module Console build: the Bun server and the browser bundle it serves. */

const server = await Bun.build({
  entrypoints: ["src/index.ts"],
  external: ["react", "react-dom", "zod"],
  naming: "index.js",
  outdir: "dist",
  sourcemap: "linked",
  target: "bun"
})

const client = await Bun.build({
  entrypoints: ["src/client/main.tsx"],
  minify: true,
  naming: "app.[ext]",
  outdir: "dist/assets",
  sourcemap: "linked",
  target: "browser"
})

for (const [name, result] of [
  ["server", server],
  ["client", client]
] as const) {
  if (!result.success) {
    for (const log of result.logs) {
      console.error(log)
    }
    throw new Error(`Console ${name} build failed`)
  }
}
console.log(`console: built ${server.outputs.length + client.outputs.length} files`)
