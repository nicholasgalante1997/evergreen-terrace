import type { BuildConfig } from 'bun';

export interface BaseConfigOptions {
  external?: string[];
  outdir?: string;
  entrypoints?: string[];
}

export function createBaseConfig(options: BaseConfigOptions = {}): Partial<BuildConfig> {
  const { external = [], outdir = './dist', entrypoints } = options;
  return {
    ...(entrypoints ? { entrypoints } : {}),
    outdir,
    target: 'bun',
    format: 'esm',
    splitting: false,
    sourcemap: 'linked',
    minify: false,
    packages: 'external',
    external,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  };
}
