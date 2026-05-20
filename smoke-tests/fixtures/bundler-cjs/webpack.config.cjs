const path = require('node:path');

module.exports = {
  mode: 'production',
  target: 'web',
  entry: path.resolve(__dirname, 'main.cjs'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    clean: true,
  },
  resolve: {
    // Force CJS resolution path through the package.json `exports` map:
    // `require('livekit-client')` should resolve to the UMD build via the
    // `require` condition.
    conditionNames: ['require', 'browser', 'default'],
    mainFields: ['browser', 'main'],
    extensions: ['.cjs', '.js'],
  },
  module: {
    // Don't statically re-parse the pre-bundled UMD. webpack's CJS analyzer
    // otherwise mis-rewrites `module.exports` inside nested UMD wrappers
    // (e.g. loglevel) because of variable-name collisions with the host
    // bundle's minified runtime. Real-world consumers of a UMD-shaped package
    // routinely apply the same noParse rule.
    noParse: /livekit-client\.umd\.js$/,
  },
  performance: {
    hints: false,
  },
  // Quiet the build; failures still surface via non-zero exit codes.
  stats: 'errors-warnings',
};
