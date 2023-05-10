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
        polyfills: [
          // rollup-common-js and tsproto have environment checks using `globalThis` which causes the compat check to fail on the output
          'globalThis',
        ],
      },
    ],
  },
};
