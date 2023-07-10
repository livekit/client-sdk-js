import { babel } from '@rollup/plugin-babel';
import dns from 'dns';
import { resolve } from 'path';
import replace from 'rollup-plugin-re';
import { defineConfig } from 'vite';
import viteBabel from 'vite-plugin-babel';

dns.setDefaultResultOrder('verbatim');

export default defineConfig({
  server: {
    port: 8080,
    open: true,
  },

  plugins: [
    // use babel decorator plugin during serve until esbuild (which vite uses for the dev server) supports downlevelling decorators natively
    // see https://github.com/evanw/esbuild/issues/104
    viteBabel({
      filter: /\.ts?$/,
      apply: 'serve',
      babelConfig: {
        babelrc: false,
        configFile: false,
        plugins: [
          ['@babel/plugin-proposal-decorators', { loose: true, version: '2023-05' }],
          '@babel/plugin-transform-typescript',
        ],
      },
    }),
  ],

  build: {
    minify: 'esbuild',
    target: 'es2019',
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
