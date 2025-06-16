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
  ...compat.extends('plugin:import/recommended', 'airbnb-typescript/base', 'prettier'),
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
      },
    },
    rules: {
      'import/export': 'off',
      'max-classes-per-file': 'off',
      'no-param-reassign': 'off',
      'no-await-in-loop': 'off',
      'no-restricted-syntax': 'off',
      'consistent-return': 'off',
      'class-methods-use-this': 'off',
      'no-underscore-dangle': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
    },
  },
]);
