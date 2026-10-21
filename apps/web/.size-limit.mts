import { readFileSync } from 'node:fs';

// Budget du JS initial : le script d'entrée et les `modulepreload` de index.html. Les chunks
// des routes chargées à la demande n'en font pas partie.
const dist = '../../dist/apps/web';
const html = readFileSync(new URL(`${dist}/index.html`, import.meta.url), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map(
  ([, file]) => `${dist}/${file}`,
);
if (initial.length === 0) throw new Error(`No initial JS found in ${dist}/index.html`);

export default [{ name: 'initial JS (gzip)', path: initial, gzip: true, limit: '170 kB' }];
