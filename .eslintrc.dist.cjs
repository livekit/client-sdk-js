module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2022,
    // sourceType: 'module',
    project: undefined,
  },
  env: { es2021: true },
  plugins: ['ecmascript-compat'],
  rules: {
    'ecmascript-compat/compat': [
      'error',
      {
        polyfills: ['globalThis'],
      },
    ],
  },
};
