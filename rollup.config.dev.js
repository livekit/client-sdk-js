// @ts-check
import glob from 'glob';
import path from 'path';
import typescript from 'rollup-plugin-typescript2';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';

const watcher = (globs) => ({
  buildStart() {
    for (const item of globs) {
      glob.sync(path.resolve(__dirname, item)).forEach((filename) => {
        this.addWatchFile(filename);
      });
    }
  },
});

export default {
  input: 'example/sample.ts',
  output: [
    {
      file: `example/build/bundle.js`,
      format: 'esm',
      strict: true,
      sourcemap: true,
      inlineDynamicImports: true,
    },
  ],
  plugins: [
    nodeResolve({ browser: true, preferBuiltins: false }),
    typescript({ tsconfig: './example/tsconfig.json' }),
    commonjs(),
    json(),
    serve({ contentBase: 'example', open: true, port: 8080 }),
    watcher(['example/index.html', 'example/styles.css']),
    livereload(),
  ],
};
