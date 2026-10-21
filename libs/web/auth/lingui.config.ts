import { defineConfig } from '@lingui/cli';

// Config minimale pour la macro Lingui des tests ; le catalogue vit dans apps/web.
export default defineConfig({
  sourceLocale: 'fr',
  locales: ['fr', 'en'],
});
