import { babel } from '@rollup/plugin-babel';
import dns from 'dns';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

dns.setDefaultResultOrder('verbatim');

export default defineConfig({
  server: {
    port: 8080,
    open: true,
    fs: {
      strict: false,
    },
  },
  build: {
    minify: 'esbuild',
    target: 'es2019',
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(import.meta.dirname, 'src/index.ts'),
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
      ],
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    // e2e tests need a real server + node WebSocket; run them via the
    // dedicated `pnpm test:e2e` config (vitest.e2e.config.mts), not the unit run.
    exclude: [...configDefaults.exclude, '**/*.e2e.test.ts'],
  },
});
