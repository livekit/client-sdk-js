// @ts-check
import typescript from 'rollup-plugin-typescript2';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { babel } from '@rollup/plugin-babel';
import json from '@rollup/plugin-json';
import { terser } from 'rollup-plugin-terser';
import replace from 'rollup-plugin-re';
import filesize from 'rollup-plugin-filesize';
import webWorkerLoader from 'rollup-plugin-web-worker-loader';

import packageJson from './package.json';

function kebabCaseToPascalCase(string = '') {
  return string.replace(/(^\w|-\w)/g, (replaceString) =>
    replaceString.replace(/-/, '').toUpperCase(),
  );
}

export default {
  input: 'src/index.ts',
  output: [
    {
      file: `dist/${packageJson.name}.esm.mjs`,
      format: 'esm',
      strict: true,
      sourcemap: true,
    },
    {
      file: `dist/${packageJson.name}.umd.js`,
      format: 'umd',
      strict: true,
      sourcemap: true,
      name: kebabCaseToPascalCase(packageJson.name),
      plugins: [terser()],
    },
  ],
  plugins: [
    nodeResolve({ browser: true, preferBuiltins: false }),
    // @ts-ignore
    webWorkerLoader(),
    typescript({ tsconfig: './tsconfig.json' }),
    commonjs(),
    json(),
    babel({
      babelHelpers: 'bundled',
      presets: [['@babel/preset-env', { include: ['@babel/plugin-proposal-object-rest-spread'] }]],
      extensions: ['.js', '.ts', '.mjs'],
    }),
    replace({
      patterns: [
        {
          // protobuf.js uses `eval` to determine whether a module is present or not
          // in most modern browsers this will fail anyways due to CSP, and it's safer to just replace it with `undefined`
          // until this PR is merged: https://github.com/protobufjs/protobuf.js/pull/1548
          // related discussion: https://github.com/protobufjs/protobuf.js/issues/593
          test: /eval.*\(moduleName\);/g,
          replace: 'undefined;',
        },
      ],
    }),
    filesize(),
  ],
};
