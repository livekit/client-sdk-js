// @ts-check
import { rolldown } from 'rolldown';
import del from 'rollup-plugin-delete';
import { minify } from 'rollup-plugin-esbuild';
import packageJson from './package.json' with { type: 'json' };

export function kebabCaseToPascalCase(string = '') {
  return string.replace(/(^\w|-\w)/g, (replaceString) =>
    replaceString.replace(/-/, '').toUpperCase(),
  );
}

const clientBundle = await rolldown({
  input: 'src/index.ts',
  plugins: [del({ targets: 'dist/*' })],
});

const workerBundle = await rolldown({
  input: 'src/e2ee/worker/e2ee.worker.ts',
  plugins: [del({ targets: 'dist/*' })],
});

await Promise.all([
  clientBundle.write({
    file: `dist/${packageJson.name}.esm.mjs`,
    format: 'esm',
    sourcemap: true,
  }),
  clientBundle.write({
    file: `dist/${packageJson.name}.umd.js`,
    format: 'umd',
    sourcemap: true,
    name: kebabCaseToPascalCase(packageJson.name),
    plugins: [minify()],
  }),
  workerBundle.write({
    file: `dist/${packageJson.name}.e2ee.worker.mjs`,
    format: 'esm',
    sourcemap: true,
  }),
  workerBundle.write({
    file: `dist/${packageJson.name}.e2ee.worker.js`,
    format: 'umd',
    sourcemap: true,
    name: kebabCaseToPascalCase(packageJson.name) + '.e2ee.worker',
    plugins: [minify()],
  }),
]);
