const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/auth'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      // Même image, trois commandes : node main.js (HTTP), node migrate.js (tables de Better Auth),
      // node operators.js (opérateurs de la plateforme, ADR 0019).
      additionalEntryPoints: [
        { entryName: 'migrate', entryPath: './src/migrate.ts' },
        { entryName: 'operators', entryPath: './src/operators.ts' },
      ],
      tsConfig: './tsconfig.app.json',
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      sourceMap: true,
    }),
  ],
};
