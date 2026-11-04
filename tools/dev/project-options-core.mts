/**
 * Options d'un projet issu du boilerplate : ce qu'on peut retirer au démarrage (code d'exemple…).
 * Chaque option retire des fichiers entiers et des blocs entre marqueurs `<marqueur>:start` et
 * `<marqueur>:end`. Logique pure ; les fichiers et les commandes sont dans project-steps.mts.
 */

export type OptionId = 'examples';
type Regeneration = 'migrations' | 'routes' | 'i18n';

export interface ProjectOption {
  id: OptionId;
  /** Question posée par create:project ; « oui » garde l'option. */
  question: string;
  /** `example`, ou `option:<id>` pour les nouvelles options. */
  marker: string;
  /** Fichiers et dossiers propres à l'option, supprimés entiers. */
  paths: readonly string[];
  /** Paquets retirés de package.json. */
  dependencies: readonly string[];
  regenerate: readonly Regeneration[];
  /** Mentions à relire après le retrait (`git grep -i -E`). */
  leftovers: string;
  /** Consigne affichée après le retrait. */
  afterRemoval?: string;
}

const PROJECT_OPTIONS: readonly ProjectOption[] = [
  {
    id: 'examples',
    question:
      "Garder le code d'exemple (catalog, orders, notifications, boutique) ? Modèle utile, à retirer avant le premier déploiement.",
    marker: 'example',
    paths: [
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
    ],
    dependencies: [],
    regenerate: ['migrations', 'routes', 'i18n'],
    leftovers:
      'storefront|ProductCatalog|CatalogFacade|libs/api/(catalog|orders|notifications)|(^|[^a-z])(PRD|ORD)-',
    afterRemoval:
      "retirer storefront de FEATURE_FLAGS dans apps/api/.env ou .env s'il y figure (un flag inconnu empêche l'API de démarrer)",
  },
];

export function optionById(id: OptionId): ProjectOption {
  const option = PROJECT_OPTIONS.find((candidate) => candidate.id === id);
  if (!option) throw new Error(`Option inconnue : ${id}`);
  return option;
}

/** Formes d'une ligne de marqueur (TS, shell/YAML, JSX, Markdown) : ouverture et fermeture. */
const WRAPPERS = [
  ['// ', ''],
  ['# ', ''],
  ['{/* ', ' */}'],
  ['<!-- ', ' -->'],
] as const;
const MARKER = /^(example|option:[a-z0-9-]+):(start|end)$/;

/** Marqueur porté par une ligne entière, quelle que soit l'option ; sinon undefined. */
function parseMarker(line: string): { name: string; edge: 'start' | 'end' } | undefined {
  const trimmed = line.trim();
  for (const [open, close] of WRAPPERS) {
    if (trimmed.startsWith(open) && trimmed.endsWith(close)) {
      const match = MARKER.exec(trimmed.slice(open.length, trimmed.length - close.length));
      if (match) return { name: match[1] ?? '', edge: match[2] === 'start' ? 'start' : 'end' };
    }
  }
  return undefined;
}

/** Retire les blocs de `marker`, marqueurs compris ; refuse un bloc mal formé. */
export function stripBlocks(
  text: string,
  file: string,
  marker: string,
): { text: string; blocks: number } {
  const kept: string[] = [];
  let openedAt: number | undefined;
  let blocks = 0;
  text.split('\n').forEach((line, index) => {
    const parsed = parseMarker(line);
    const at = `${file}:${index + 1}`;
    if (parsed?.name === marker && parsed.edge === 'start') {
      if (openedAt !== undefined) {
        throw new Error(`${at} : ${marker}:start imbriqué (bloc ouvert ligne ${openedAt}).`);
      }
      openedAt = index + 1;
    } else if (parsed?.name === marker) {
      if (openedAt === undefined) throw new Error(`${at} : ${marker}:end sans ${marker}:start.`);
      openedAt = undefined;
      blocks++;
    } else if (openedAt === undefined) {
      kept.push(line);
    }
  });
  if (openedAt !== undefined) {
    throw new Error(`${file}:${openedAt} : ${marker}:start sans ${marker}:end.`);
  }
  return { text: kept.join('\n'), blocks };
}

/**
 * Valide les marqueurs de toutes les options avant tout retrait : marqueur inconnu, bloc non fermé,
 * ou bloc imbriqué (y compris d'une autre option, qu'un retrait laisserait orphelin).
 */
export function checkMarkers(text: string, file: string, markers: readonly string[]): void {
  let opened: { name: string; line: number } | undefined;
  text.split('\n').forEach((line, index) => {
    const parsed = parseMarker(line);
    if (!parsed) return;
    const at = `${file}:${index + 1}`;
    if (!markers.includes(parsed.name)) {
      throw new Error(`${at} : marqueur ${parsed.name} d'une option inconnue.`);
    }
    if (parsed.edge === 'start') {
      if (opened) {
        throw new Error(
          `${at} : ${parsed.name}:start dans un bloc ${opened.name} (ouvert ligne ${opened.line}).`,
        );
      }
      opened = { name: parsed.name, line: index + 1 };
    } else {
      if (opened?.name !== parsed.name) {
        throw new Error(`${at} : ${parsed.name}:end sans ${parsed.name}:start.`);
      }
      opened = undefined;
    }
  });
  if (opened) {
    throw new Error(`${file}:${opened.line} : ${opened.name}:start sans ${opened.name}:end.`);
  }
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

/** Choix de create:project : nouveau scope (absent : on ne renomme pas) et options à retirer. */
export interface Choices {
  name?: string;
  remove: OptionId[];
  keepMigrations: boolean;
}

/** Réponse à une question oui/non ; vide : `fallback` ; incompréhensible : undefined. */
export function parseYesNo(answer: string, fallback: boolean): boolean | undefined {
  const normalized = answer.trim().toLowerCase();
  if (normalized === '') return fallback;
  if (['o', 'oui', 'y', 'yes'].includes(normalized)) return true;
  if (['n', 'non', 'no'].includes(normalized)) return false;
  return undefined;
}

/** Retire des paquets des `dependencies` et `devDependencies` de package.json. */
export function removeDependencies(
  packageJson: string,
  names: readonly string[],
): { text: string; removed: string[] } {
  const json = JSON.parse(packageJson) as Record<string, Record<string, string> | undefined>;
  const removed = new Set<string>();
  for (const field of ['dependencies', 'devDependencies']) {
    const dependencies = json[field];
    for (const name of names) {
      if (dependencies && name in dependencies) {
        delete dependencies[name];
        removed.add(name);
      }
    }
  }
  if (removed.size === 0) return { text: packageJson, removed: [] };
  return { text: `${JSON.stringify(json, null, 2)}\n`, removed: [...removed] };
}

/** Récapitulatif affiché avant la confirmation. */
export function summarize(choices: Choices, kept: readonly OptionId[]): string {
  const lines: string[] = [];
  if (choices.name) lines.push(`Renommer le scope en @${choices.name}`);
  if (kept.length > 0) lines.push(`Garder : ${kept.join(', ')}`);
  lines.push(
    choices.remove.length > 0 ? `Retirer : ${choices.remove.join(', ')}` : 'Rien à retirer',
  );
  if (choices.remove.some((id) => optionById(id).regenerate.includes('migrations'))) {
    lines.push(
      choices.keepMigrations
        ? 'Migrations : migrations gardées (projet déjà déployé)'
        : 'Migrations : migration unique régénérée',
    );
  }
  return lines.join('\n');
}
