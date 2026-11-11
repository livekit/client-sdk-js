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
 * machina calls `Object.hasOwn` (Safari 15.4) and `WeakRef` (Safari 14.1) when a state machine is
 * created. Babel converts syntax only, so this rewrites both calls in the bundled copy. Without
 * `WeakRef` the shim holds a strong reference: `createFsm` has one client, the machine itself, so
 * nothing outlives the machine. Remove this when machina supports these browsers upstream.
 * The core entry leaves machina external, so this does not reach it.
 * @type {import('rollup').Plugin}
 */
const machinaBrowserCompat = {
  name: 'machina-browser-compat',
  transform(code, id) {
    if (!/node_modules[\\/]machina[\\/]/.test(id)) {
      return null;
    }
    const rewritten = code
      .replaceAll('Object.hasOwn(', 'Object.prototype.hasOwnProperty.call(')
      .replaceAll('new WeakRef(', 'new __lkWeakRef(');
    if (rewritten === code || /Object\.hasOwn|\bWeakRef\b/.test(rewritten)) {
      // Fail loudly: a machina upgrade changed what this plugin expects.
      this.error(`machina-browser-compat: unexpected Object.hasOwn/WeakRef usage in ${id}`);
    }
    const shim =
      "const __lkWeakRef = typeof WeakRef !== 'undefined' ? WeakRef : " +
      'class { constructor(target) { this.target = target; } deref() { return this.target; } };';
    // The shim stays on the first line (no newline), so the source map lines still match.
    return { code: shim + rewritten, map: null };
  },
};

/**
 * @type {import('rollup').InputPluginOption}
 */
export const commonPlugins = [
  nodeResolve({ browser: true, preferBuiltins: false }),
  machinaBrowserCompat,
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
    // bundler drops unused modules whole. It emits its own declarations with `@internal` members
    // stripped (dist/core/types); the main entry keeps them for the packages that use them.
    // The declaration program is rooted at core.ts, so index.ts (with the `declare module`
    // augmentations of the full entry) is not in it and tsc cannot write `import("../..")`.
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
        useTsconfigDeclarationDir: true,
        tsconfigOverride: {
          compilerOptions: {
            declaration: true,
            declarationMap: false,
            declarationDir: 'dist/core/types',
            stripInternal: true,
          },
          include: ['src/type-polyfills/*.d.ts'],
          files: ['src/core.ts'],
        },
      }),
      ...commonPlugins,
    ],
  },
];
