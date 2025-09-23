// @ts-check
import { rolldown } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import { minify } from 'rollup-plugin-esbuild';
import packageJson from './package.json' with { type: 'json' };

export function kebabCaseToPascalCase(string = '') {
  return string.replace(/(^\w|-\w)/g, (replaceString) =>
    replaceString.replace(/-/, '').toUpperCase(),
  );
}

const [clientBundle, workerBundle, clientDts, workerDts] = await Promise.all([
  rolldown({
    input: 'src/index.ts',
  }),
  rolldown({
    input: 'src/e2ee/worker/e2ee.worker.ts',
  }),
  rolldown({
    input: 'src/index.ts',
    plugins: [
      dts({
        tsconfig: 'tsconfig.json',
        parallel: true,
        emitDtsOnly: true,
        tsgo: true,
      }),
    ],
  }),
  rolldown({
    input: 'src/e2ee/worker/e2ee.worker.ts',
    plugins: [
      dts({
        tsconfig: 'tsconfig.json',
        emitDtsOnly: true,
        tsgo: true,
      }),
    ],
  }),
]);

await Promise.all([
  clientBundle.write({
    file: `dist/${packageJson.name}.esm.mjs`,
    format: 'es',
    sourcemap: true,
  }),
  clientDts.write({
    dir: 'dist',
    entryFileNames: (chunkInfo) => {
      return `${chunkInfo.name}.mjs`;
    },
  }),
  clientBundle.write({
    file: `dist/${packageJson.name}.umd.js`,
    format: 'umd',
    sourcemap: true,
    name: kebabCaseToPascalCase(packageJson.name),
    plugins: [minify()],
  }),
  clientDts.write({
    dir: 'dist',
    entryFileNames: (chunkInfo) => {
      return `${chunkInfo.name}.js`;
    },
  }),
  workerBundle.write({
    file: `dist/${packageJson.name}.e2ee.worker.esm.mjs`,
    format: 'esm',
    sourcemap: true,
  }),
  workerDts.write({
    dir: 'dist',
    entryFileNames: (chunkInfo) => {
      return `${chunkInfo.name}.mjs`;
    },
  }),
  workerBundle.write({
    file: `dist/${packageJson.name}.e2ee.worker.umd.js`,
    format: 'umd',
    sourcemap: true,
    name: kebabCaseToPascalCase(packageJson.name) + '.e2ee.worker',
    plugins: [minify()],
  }),
  workerDts.write({
    dir: 'dist',
    entryFileNames: (chunkInfo) => {
      return `${chunkInfo.name}.js`;
    },
  }),
]);
