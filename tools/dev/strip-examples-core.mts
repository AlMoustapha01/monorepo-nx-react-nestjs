/**
 * Retrait du code d'exemple (catalog, orders, notifications, boutique) d'un projet issu du
 * boilerplate. Logique pure ; les fichiers et les commandes sont dans strip-examples.mts.
 */

/** Fichiers et dossiers propres aux exemples, supprimés entiers. */
export const EXAMPLE_PATHS = [
  'libs/api/catalog',
  'libs/api/orders',
  'libs/api/notifications',
  'libs/web/storefront',
  'libs/shared/contracts/src/lib/catalog',
  'libs/shared/contracts/src/lib/orders',
  'apps/api/tests/catalog.e2e.spec.ts',
  'apps/api/tests/orders.e2e.spec.ts',
  'apps/api/tests/notifications.e2e.spec.ts',
  'apps/web/src/routes/_authenticated/(boutique)',
  'apps/web/src/storefront.spec.tsx',
  'apps/web-e2e/src/storefront.spec.ts',
  'apps/web-e2e/src/storefront-support.ts',
  'docs/superpowers/plans/2026-10-21-storefront.md',
  'docs/superpowers/specs/2026-10-21-storefront-design.md',
];

/** Mentions à relire après le retrait (`git grep -i -E`). */
export const LEFTOVER_PATTERN =
  'storefront|ProductCatalog|CatalogFacade|libs/api/(catalog|orders|notifications)|(^|[^a-z])(PRD|ORD)-';

/** Lignes entières qui ouvrent ou ferment un bloc d'exemple (TS, JSX, shell/YAML, Markdown). */
const MARKERS = new Map<string, 'start' | 'end'>(
  [
    ['// ', ''],
    ['# ', ''],
    ['{/* ', ' */}'],
    ['<!-- ', ' -->'],
  ].flatMap(([open, close]) => [
    [`${open}example:start${close}`, 'start'],
    [`${open}example:end${close}`, 'end'],
  ]),
);

/** Retire les blocs `example:start` … `example:end`, marqueurs compris ; refuse un bloc mal formé. */
export function stripExampleBlocks(text: string, file: string): { text: string; blocks: number } {
  const kept: string[] = [];
  let openedAt: number | undefined;
  let blocks = 0;
  text.split('\n').forEach((line, index) => {
    const marker = MARKERS.get(line.trim());
    const at = `${file}:${index + 1}`;
    if (marker === 'start') {
      if (openedAt !== undefined) {
        throw new Error(`${at} : example:start imbriqué (bloc ouvert ligne ${openedAt}).`);
      }
      openedAt = index + 1;
    } else if (marker === 'end') {
      if (openedAt === undefined) throw new Error(`${at} : example:end sans example:start.`);
      openedAt = undefined;
      blocks++;
    } else if (openedAt === undefined) {
      kept.push(line);
    }
  });
  if (openedAt !== undefined) {
    throw new Error(`${file}:${openedAt} : example:start sans example:end.`);
  }
  return { text: kept.join('\n'), blocks };
}

/** Retire de `compilerOptions.paths` les alias dont aucune cible n'existe plus. */
export function prunePaths(
  tsconfig: string,
  exists: (target: string) => boolean,
): { text: string; removed: string[] } {
  const json = JSON.parse(tsconfig) as { compilerOptions?: { paths?: Record<string, string[]> } };
  const paths = json.compilerOptions?.paths ?? {};
  const removed = Object.keys(paths).filter((alias) => !paths[alias]?.some(exists));
  if (removed.length === 0) return { text: tsconfig, removed };
  for (const alias of removed) delete paths[alias];
  return { text: `${JSON.stringify(json, null, 2)}\n`, removed };
}
