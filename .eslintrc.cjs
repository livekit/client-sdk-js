module.exports = {
  root: true,
  plugins: ['compat'],
  extends: [
    'plugin:import/recommended',
    'airbnb-typescript/base',
    'prettier',
    'plugin:compat/recommended',
  ],
  parserOptions: {
    project: './tsconfig.eslint.json',
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
  env: {
    browser: true,
  },
};
