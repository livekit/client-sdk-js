import { resolve } from 'path';
import { defineConfig } from 'vite';
import { babel } from '@rollup/plugin-babel';
import replace from 'rollup-plugin-re';

export default defineConfig({
  build: {
    minify: 'esbuild',
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Livekit Client SDK JS',
      // the proper extensions will be added
      fileName: 'livekit-client',
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: [],
      output: {},
      plugins: [
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
    },
  },
});
