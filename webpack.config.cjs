const webpack = require('webpack');
const nodeModulePrefixRe = /^node:/u;

module.exports = {
  entry: ['./src/index.ts'],
  stats: { warnings: false },
  module: {
    unknownContextCritical: false,
    rules: [
      { test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  devServer: {
    static: './dist',
    client: {
      overlay: {
        errors: true,
        warnings: false,
        runtimeErrors: true,
      },
    },
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      './main.js': './main.ts',
    },
    fallback: {
      fs: false,
      os: false,
      path: false,
      util: false,
      url: require.resolve('url/'),
    },
  },
  mode: 'production',
  plugins: [
    new webpack.NormalModuleReplacementPlugin(
      nodeModulePrefixRe,
      (resource) => {
        const module = resource.request.replace(nodeModulePrefixRe, '');
        resource.request = module;
      },
    ),
  ],
};
