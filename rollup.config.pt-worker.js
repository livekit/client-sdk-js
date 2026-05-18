import terser from '@rollup/plugin-terser';
import typescript from 'rollup-plugin-typescript2';
import packageJson from './package.json';
import { commonPlugins, kebabCaseToPascalCase } from './rollup.config';

export default {
  input: 'src/packetTrailer/worker/packetTrailer.worker.ts',
  output: [
    {
      file: `dist/${packageJson.name}.pt.worker.mjs`,
      format: 'es',
      strict: true,
      sourcemap: true,
    },
    {
      file: `dist/${packageJson.name}.pt.worker.js`,
      format: 'umd',
      strict: true,
      sourcemap: true,
      name: kebabCaseToPascalCase(packageJson.name) + '.pt.worker',
      plugins: [terser()],
    },
  ],
  plugins: [typescript({ tsconfig: './src/packetTrailer/worker/tsconfig.json' }), ...commonPlugins],
};
