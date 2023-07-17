/**
 * Note: Vite is only used as a (fast) dev server.
 * For building the library we invoke rollup directly.
 **/
import dns from 'dns';
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
        presets: ['@babel/preset-typescript', ['@babel/preset-env', { modules: false }]],
        plugins: [['@babel/plugin-proposal-decorators', { loose: true, version: '2023-05' }]],
      },
    }),
  ],
});
