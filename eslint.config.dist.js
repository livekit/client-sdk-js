// @ts-check
import { FlatCompat } from '@eslint/eslintrc';
import { defineConfig } from 'eslint/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default defineConfig([
  ...compat.plugins('ecmascript-compat'),
  {
    languageOptions: {
      ecmaVersion: 2022,
      parserOptions: {
        // sourceType: 'module',
        project: undefined,
      },
    },
    rules: {
      'ecmascript-compat/compat': [
        'warn',
        {
          polyfills: ['globalThis'],
        },
      ],
    },
  },
]);
