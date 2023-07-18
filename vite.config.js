<<<<<<< HEAD
/**
 * Note: Vite is only used as a (fast) dev server.
 * For building the library we invoke rollup directly.
 **/
import dns from 'dns';
import { defineConfig } from 'vite';
import viteBabel from 'vite-plugin-babel';
=======
import { babel } from '@rollup/plugin-babel';
import dns from 'dns';
import { resolve } from 'path';
import replace from 'rollup-plugin-re';
import { defineConfig } from 'vite';
>>>>>>> main

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
        presets: ['@babel/preset-typescript', ['@babel/preset-env', { modules: false }]],
        plugins: [['@babel/plugin-proposal-decorators', { loose: true, version: '2023-05' }]],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
  },
});
