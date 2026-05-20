/* eslint-disable import/no-extraneous-dependencies */
import dns from 'dns';
import { resolve } from 'path';
import { defineConfig } from 'vite';

dns.setDefaultResultOrder('verbatim');

export default defineConfig({
  server: {
    port: 8080,
    open: true,
    fs: {
      strict: false,
    },
  },
  test: {
    environment: 'happy-dom',
  },
});
