// @ts-check
import typescript from 'rollup-plugin-typescript2';
import packageJson from './package.json';
import { commonPlugins } from './rollup.config';

/**
 * The core entry: `CoreRoom` plus the extensions, each tree-shakeable. ESM only; the UMD
 * bundle stays full-featured. Not in package.json exports yet, built for size tracking.
 * @type {import('rollup').RollupOptions}
 */
export default {
  input: 'src/core.ts',
  output: [
    {
      file: `dist/${packageJson.name}.core.esm.mjs`,
      format: 'es',
      strict: true,
      sourcemap: true,
      compact: true,
    },
  ],
  plugins: [typescript({ tsconfig: './tsconfig.json' }), ...commonPlugins],
};
