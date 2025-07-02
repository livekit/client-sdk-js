// @ts-check
import { rolldown } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import del from 'rollup-plugin-delete';
import { minify } from 'rollup-plugin-esbuild';
import packageJson from './package.json' with { type: 'json' };

export function kebabCaseToPascalCase(string = '') {
  return string.replace(/(^\w|-\w)/g, (replaceString) =>
    replaceString.replace(/-/, '').toUpperCase(),
  );
}

const inputPlugins = [
  del({ targets: 'dist/*' }),
  dts({
    tsconfig: 'tsconfig.json',
  }),
];

const clientBundle = await rolldown({
  input: 'src/index.ts',
  plugins: inputPlugins,
});

const workerBundle = await rolldown({
  input: 'src/e2ee/worker/e2ee.worker.ts',
  plugins: inputPlugins,
});

await Promise.all([
  clientBundle.write({
    dir: 'dist',
    entryFileNames: (chunkInfo) => {
      if (chunkInfo.name === 'index') {
        return `${packageJson.name}.esm.mjs`;
      }
      return `${packageJson.name}.${chunkInfo.name}.mjs`;
    },
    format: 'esm',
    sourcemap: true,
  }),
  // clientBundle.write({
  //   dir: 'dist',
  //   format: 'umd',
  //   sourcemap: true,
  //   name: kebabCaseToPascalCase(packageJson.name),
  //   plugins: [minify()],
  // }),
  workerBundle.write({
    dir: 'dist',
    entryFileNames: (chunkInfo) => {
      if (chunkInfo.name === 'e2ee.worker') {
        return `${packageJson.name}.e2ee.worker.mjs`;
      }
      return chunkInfo.name;
    },
    format: 'esm',
    sourcemap: true,
  }),
  // workerBundle.write({
  //   dir: 'dist',
  //   format: 'umd',
  //   sourcemap: true,
  //   name: kebabCaseToPascalCase(packageJson.name) + '.e2ee.worker',
  //   plugins: [minify()],
  // }),
]);
