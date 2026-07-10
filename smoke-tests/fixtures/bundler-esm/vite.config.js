import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      // Implicit input: ./index.html
    },
  },
  resolve: {
    // Force ESM resolution — this is what we are validating.
    conditions: ['import', 'browser', 'module', 'default'],
  },
});
