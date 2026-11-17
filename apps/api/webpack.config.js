const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/api'),
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
      // Même image, une commande par rôle : node main.js (HTTP), worker.js (jobs), migrate.js (migrations),
      // feature-flags.js (surcharges par tenant, exploitation).
      additionalEntryPoints: [
        { entryName: 'worker', entryPath: './src/worker.ts' },
        { entryName: 'migrate', entryPath: './src/migrate.ts' },
        // option:feature-flags:start
        { entryName: 'feature-flags', entryPath: './src/feature-flags.ts' },
        // option:feature-flags:end
      ],
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets', { input: './migrations', glob: '**/*', output: 'migrations' }],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      sourceMap: true,
    }),
  ],
};
