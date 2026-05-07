// @ts-check
import js from '@eslint/js';
import { configs, plugins, rules } from 'eslint-config-airbnb-extended';
import { rules as prettierConfigRules } from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

const strictness = 'off';

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
  // Javascript Config
  ...jsConfig,
  // TypeScript Config
  ...typescriptConfig,
  // Prettier Config
  ...prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: false,
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

      // compat rules to make lint temporarily pass after upgrading to eslint v9 and airbnb-config-extended
      // these can then get removed one by one to allow for small and focused PRs
      'import-x/prefer-default-export': strictness,
      'import-x/order': strictness,
      'import-x/consistent-type-specifier-style': strictness,
      'import-x/no-cycle': strictness,
      'import-x/no-extraneous-dependencies': strictness,
      'import-x/export': strictness,
      'import-x/no-namespace': strictness,

      '@typescript-eslint/no-use-before-define': strictness,
      '@typescript-eslint/consistent-type-definitions': strictness,
      '@typescript-eslint/explicit-module-boundary-types': strictness,
      '@typescript-eslint/no-explicit-any': strictness,
      '@typescript-eslint/ban-ts-comment': strictness,
      '@typescript-eslint/no-wrapper-object-types': strictness,
      '@typescript-eslint/consistent-type-imports': strictness,
      '@typescript-eslint/method-signature-style': strictness,
      '@typescript-eslint/unified-signatures': strictness,
      '@typescript-eslint/no-unsafe-return': strictness,
      '@typescript-eslint/await-thenable': strictness,
      '@typescript-eslint/prefer-regexp-exec': strictness,
      '@typescript-eslint/no-confusing-void-expression': strictness,
      '@typescript-eslint/no-empty-object-type': strictness,
      '@typescript-eslint/no-import-type-side-effects': strictness,
      '@typescript-eslint/no-invalid-void-type': strictness,
      '@typescript-eslint/no-namespace': strictness,
      '@typescript-eslint/prefer-destructuring': strictness,
      '@typescript-eslint/consistent-type-assertions': strictness,
      '@typescript-eslint/no-unnecessary-type-assertion': strictness,
      '@typescript-eslint/no-non-null-assertion': strictness,
      '@typescript-eslint/prefer-optional-chain': strictness,
      '@typescript-eslint/prefer-for-of': strictness,
      '@typescript-eslint/no-duplicate-type-constituents': strictness,
      '@typescript-eslint/consistent-indexed-object-style': strictness,
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': strictness,
      '@typescript-eslint/class-literal-property-style': strictness,
      '@typescript-eslint/consistent-generic-constructors': strictness,
      '@typescript-eslint/promise-function-async': strictness,
      '@typescript-eslint/no-unsafe-enum-comparison': strictness,
      '@typescript-eslint/no-redundant-type-constituents': strictness,
      '@typescript-eslint/prefer-reduce-type-parameter': strictness,
      '@typescript-eslint/no-unused-vars': strictness,
      '@typescript-eslint/prefer-includes': strictness,
      '@typescript-eslint/no-misused-spread': strictness,
      '@typescript-eslint/consistent-type-exports': strictness,
      '@typescript-eslint/prefer-function-type': strictness,
      '@typescript-eslint/prefer-find': strictness,

      '@stylistic/spaced-comment': strictness,

      'no-self-assign': strictness,
      'no-plusplus': strictness,
      'no-bitwise': strictness,
      'no-else-return': strictness,
      'no-nested-ternary': strictness,
      'no-promise-executor-return': strictness,
      'prefer-const': strictness,
      'prefer-exponentiation-operator': strictness,
      'no-async-promise-executor': strictness,
      'no-console': strictness,
      'no-restricted-properties': strictness,
      'no-undef-init': strictness,
      'no-irregular-whitespace': strictness,
      'object-shorthand': strictness,
      'no-case-declarations': strictness,
      'no-useless-escape': strictness,
      'no-useless-catch': strictness,
      'no-useless-return': strictness,
      'no-return-assign': strictness,
      'no-fallthrough': strictness,
      'default-case': strictness,
      'operator-assignment': strictness,
      'prefer-promise-reject-errors': strictness,
      'no-continue': strictness,
      'arrow-body-style': strictness,
      'no-new': strictness,
      'vars-on-top': strictness,
      'no-var': strictness,
      'no-restricted-globals': strictness,
      'no-lonely-if': strictness,
      'no-empty': strictness,
      'one-var': strictness,
      'no-multi-assign': strictness,
      'new-cap': strictness,

      radix: strictness,
      eqeqeq: strictness,

      // debatable
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
    },
  },
];
