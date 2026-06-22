import terser from '@rollup/plugin-terser';
import typescript from 'rollup-plugin-typescript2';
import packageJson from './package.json';
import { commonPlugins, kebabCaseToPascalCase } from './rollup.config';

export default {
  input: 'src/frameMetadata/worker/frameMetadata.worker.ts',
  output: [
    {
      file: `dist/${packageJson.name}.fm.worker.mjs`,
      format: 'es',
      strict: true,
      sourcemap: true,
    },
    {
      file: `dist/${packageJson.name}.fm.worker.js`,
      format: 'umd',
      strict: true,
      sourcemap: true,
      name: kebabCaseToPascalCase(packageJson.name) + '.fm.worker',
      plugins: [terser()],
    },
  ],
  plugins: [typescript({ tsconfig: './src/frameMetadata/worker/tsconfig.json' }), ...commonPlugins],
};
