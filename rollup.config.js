// @ts-check
import typescript from '@rollup/plugin-typescript'
import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import {babel} from '@rollup/plugin-babel';
import { terser } from "rollup-plugin-terser";
import replace from 'rollup-plugin-re'

import packageJson from './package.json'


function kebabCaseToPascalCase(string = '') {
  return string.replace(/(^\w|-\w)/g, (replaceString) =>
    replaceString.replace(/-/, '').toUpperCase(),
  )
}

export default {
    input: 'src/index.ts',
    output: [
      {
        file: `dist/${packageJson.name}.esm.js`,
        format: 'esm',
        strict: true,
        sourcemap: true,
        inlineDynamicImports: true,
      },
      {
        file: `dist/${packageJson.name}.umd.js`,
        format: 'umd',
        strict: true,
        sourcemap: true,
        name: kebabCaseToPascalCase(packageJson.name),
        inlineDynamicImports: true,
        plugins: [terser()],
      },
      ],
      plugins: [
          nodeResolve({browser: true, preferBuiltins: false}),
          typescript({tsconfig: './tsconfig.json'}),
          commonjs(),
          babel({babelHelpers: 'bundled', presets: ['@babel/preset-env']}),
          replace({
            patterns: [
              {
                // protobuf.js uses `eval` to determine whether a module is present or not
                // in most modern browsers this will fail anyways due to CSP, and it's safer to just replace it with `undefined`
                // until this PR is merged: https://github.com/protobufjs/protobuf.js/pull/1548
                // related discussion: https://github.com/protobufjs/protobuf.js/issues/593
                test: /eval.*\(moduleName\);/g,
                replace: 'undefined;'
              }
            ]
          })
        ]
  };
  