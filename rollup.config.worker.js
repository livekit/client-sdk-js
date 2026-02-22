import terser from '@rollup/plugin-terser';
import typescript from 'rollup-plugin-typescript2';
import packageJson from './package.json';
import { commonPlugins, kebabCaseToPascalCase } from './rollup.config';

function workerConfig(input, suffix, umdName) {
  return {
    input,
    output: [
      {
        file: `dist/${packageJson.name}.${suffix}.mjs`,
        format: 'es',
        strict: true,
        sourcemap: true,
      },
      {
        file: `dist/${packageJson.name}.${suffix}.js`,
        format: 'umd',
        strict: true,
        sourcemap: true,
        name: umdName,
        plugins: [terser()],
      },
    ],
    plugins: [typescript({ tsconfig: './src/e2ee/worker/tsconfig.json' }), ...commonPlugins],
  };
}

export default [
  workerConfig(
    'src/e2ee/worker/e2ee.worker.ts',
    'e2ee.worker',
    kebabCaseToPascalCase(packageJson.name) + '.e2ee.worker',
  ),
  workerConfig(
    'src/user_timestamp/userTimestamp.worker.ts',
    'user-timestamp.worker',
    kebabCaseToPascalCase(packageJson.name) + '.userTimestamp.worker',
  ),
];
