// @ts-check
import typescript from '@rollup/plugin-typescript'
import commonjs from '@rollup/plugin-commonjs'
import { terser } from "rollup-plugin-terser";
import { nodeResolve } from '@rollup/plugin-node-resolve'

export default {
    input: 'src/index.ts',
    output: [
        {
            format: 'iife',
            file: 'dist/livekit-client.js',
            name: 'livekit',
            inlineDynamicImports: true,
            sourcemap: true,
        },
        {
            format: 'iife',
            file: 'dist/livekit-client.min.js',
            name: 'livekit',
            inlineDynamicImports: true,
            sourcemap: true,
            plugins: [terser()]
        },
        {
          file: 'dist/livekit-client.module.js',
          format: 'esm',
          sourcemap: true,
          inlineDynamicImports: true,
        }
      ],
      plugins: [
          nodeResolve({browser: true, preferBuiltins: false}),
          typescript({tsconfig: './tsconfig.json'}),
          commonjs()
        ]
  };