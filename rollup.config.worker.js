import terser from '@rollup/plugin-terser';
import filesize from 'rollup-plugin-filesize';
import typescript from 'rollup-plugin-typescript2';
import packageJson from './package.json';
import { commonPlugins, kebabCaseToPascalCase } from './rollup.config';

export default {
  input: 'src/e2ee/worker/e2ee.worker.ts',
  output: [
    {
      file: `dist/${packageJson.name}.e2ee.worker.mjs`,
      format: 'es',
      strict: true,
      sourcemap: true,
    },
    {
      file: `dist/${packageJson.name}.e2ee.worker.js`,
      format: 'umd',
      strict: true,
      sourcemap: true,
      name: kebabCaseToPascalCase(packageJson.name) + '.e2ee.worker',
      plugins: [terser()],
    },
  ],
  plugins: [
    typescript({ tsconfig: './src/e2ee/worker/tsconfig.json' }),
    ...commonPlugins,
    filesize(),
  ],
};
