// @ts-check
import { babel } from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from 'rollup-plugin-typescript2';
import packageJson from './package.json';

export function kebabCaseToPascalCase(string = '') {
  return string.replace(/(^\w|-\w)/g, (replaceString) =>
    replaceString.replace(/-/, '').toUpperCase(),
  );
}

/**
 * @type {import('rollup').InputPluginOption}
 */
export const commonPlugins = [
  nodeResolve({ browser: true, preferBuiltins: false }),
  commonjs(),
  json(),
  babel({
    babelHelpers: 'bundled',
    plugins: ['@babel/plugin-transform-object-rest-spread'],
    presets: ['@babel/preset-env'],
    extensions: ['.js', '.ts', '.mjs'],
    babelrc: false,
  }),
];

const esmOutput = (file) => ({
  file,
  format: 'es',
  strict: true,
  sourcemap: true,
  compact: true,
});

/**
 * The main entry is one self-contained bundle (ESM and UMD). The core entry is built per module
 * below. An app must import one entry, not both: they do not share code.
 * @type {import('rollup').RollupOptions[]}
 */
export default [
  {
    input: 'src/index.ts',
    output: [
      esmOutput(`dist/${packageJson.name}.esm.mjs`),
      {
        file: `dist/${packageJson.name}.umd.js`,
        format: 'umd',
        strict: true,
        sourcemap: true,
        name: kebabCaseToPascalCase(packageJson.name),
        // mangle.safari10: avoid catch/finally identifier reuse that React Native
        // Hermes mis-resolves after catch return (client-sdk-js#1952).
        plugins: [terser({ mangle: { safari10: true } })],
      },
    ],
    plugins: [typescript({ tsconfig: './tsconfig.json' }), ...commonPlugins],
  },
  {
    // The light entry: one file per module and dependencies left external, so a consumer's
    // bundler drops unused modules whole. Types come from the main build (dist/src/core.d.ts).
    input: 'src/core.ts',
    // bare specifiers (dependencies) stay external; the entry itself has no importer
    external: (id, importer) => importer !== undefined && !/^[./\0]/.test(id),
    output: [
      {
        dir: 'dist/core',
        format: 'es',
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].mjs',
        strict: true,
        sourcemap: true,
        compact: true,
      },
    ],
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        tsconfigOverride: {
          compilerOptions: { declaration: false, declarationMap: false, stripInternal: true },
        },
      }),
      ...commonPlugins,
    ],
  },
];
