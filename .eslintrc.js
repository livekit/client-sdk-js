module.exports = {
  extends: ['airbnb-typescript/base'],
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
    '@typescript-eslint/no-use-before-define': 'off',
  },
};
