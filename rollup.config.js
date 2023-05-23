// @ts-check
import { babel } from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import del from 'rollup-plugin-delete';
import replace from 'rollup-plugin-re';
import typescript from 'rollup-plugin-typescript2';
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
    del({ targets: 'dist/*' }),
    nodeResolve({ browser: true, preferBuiltins: false }),
    json(),
    commonjs(),
    typescript({ tsconfig: './tsconfig.json' }),
    babel({
      babelHelpers: 'bundled',
      plugins: ['@babel/plugin-proposal-object-rest-spread'],
      presets: ['@babel/preset-env'],
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
  ],
};
