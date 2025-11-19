// @ts-check
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import { configs, plugins, rules } from 'eslint-config-airbnb-extended';
import { rules as prettierConfigRules } from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import path from 'path';

const gitignorePath = path.resolve('.', '.gitignore');

const jsConfig = [
  // ESLint Recommended Rules
  {
    name: 'js/config',
    ...js.configs.recommended,
  },
  // Stylistic Plugin
  plugins.stylistic,
  // Import X Plugin
  plugins.importX,
  // Airbnb Base Recommended Config
  ...configs.base.recommended,
  // Strict Import Config
  rules.base.importsStrict,
];

const typescriptConfig = [
  // TypeScript ESLint Plugin
  plugins.typescriptEslint,
  // Airbnb Base TypeScript Config
  ...configs.base.typescript,
  // Strict TypeScript Config
  rules.typescript.typescriptEslintStrict,
];

const prettierConfig = [
  // Prettier Plugin
  {
    name: 'prettier/plugin/config',
    plugins: {
      prettier: prettierPlugin,
    },
  },
  // Prettier Config
  {
    name: 'prettier/config',
    rules: {
      ...prettierConfigRules,
      'prettier/prettier': 'error',
    },
  },
];

export default [
  // Ignore .gitignore files/folder in eslint
  includeIgnoreFile(gitignorePath),
  // Javascript Config
  ...jsConfig,
  // TypeScript Config
  ...typescriptConfig,
  // Prettier Config
  ...prettierConfig,
  {
    rules: {
      'import/export': 'off',
      'import-x/prefer-default-export': 'off',
      'max-classes-per-file': 'off',
      'no-param-reassign': 'off',
      'no-await-in-loop': 'off',
      'no-restricted-syntax': 'off',
      'consistent-return': 'off',
      'class-methods-use-this': 'off',
      'no-underscore-dangle': 'off',
    },
  },
];
