module.exports = {
  root: true,
  extends: ['plugin:import/recommended', 'airbnb-typescript/base', 'prettier'],
  parserOptions: {
    project: './tsconfig.eslint.json',
  },
  plugins: ['neverthrow'],
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
    'neverthrow/must-use-result': 'error',
  },
};
