const path = require('path');

module.exports = {
  entry: './sample.ts',
  mode: 'development',
  devtool: 'inline-source-map',
  devServer: {
    open: true,
    contentBase: __dirname,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [ '.tsx', '.ts', '.js' ],
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    publicPath: '/dist/',
  },
};
