import { existsSync, readFileSync } from 'node:fs';

// Budget du JS initial : le script d'entrée et les `modulepreload` de index.html. Les chunks
// des routes chargées à la demande n'en font pas partie.
const dist = '../../dist/apps/web';
const indexHtml = new URL(`${dist}/index.html`, import.meta.url);
if (!existsSync(indexHtml)) {
  throw new Error(
    `${dist}/index.html introuvable : lancer web:build d'abord (pnpm nx run web:size le fait).`,
  );
}
const html = readFileSync(indexHtml, 'utf8');
const initial = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map(
  ([, file]) => `${dist}/${file}`,
);
if (initial.length === 0) throw new Error(`No initial JS found in ${dist}/index.html`);

export default [{ name: 'initial JS (gzip)', path: initial, gzip: true, limit: '170 kB' }];
