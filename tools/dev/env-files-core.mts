/**
 * Fichiers .env de dev : un à la racine pour ce qui est commun (infra, contrat d'auth), un par app
 * pour ce qu'elle seule lit. Migration d'un ancien .env unique vers ce découpage. Logique pure ;
 * les fichiers sont dans setup.mts.
 */

/** Fichier de chaque app, à côté de son exemple. Chacune lit le sien, puis celui de la racine. */
export const APP_ENV_FILES = ['apps/api/.env', 'apps/auth/.env', 'apps/web/.env'] as const;

/** `KEY=valeur`, ou `# KEY=valeur` pour une variable commentée. */
const ASSIGNMENT = /^(#\s*)?([A-Z][A-Z0-9_]*)=(.*)$/;

interface Assignment {
  key: string;
  active: boolean;
  value: string;
}

function parseLine(line: string): Assignment | undefined {
  const match = ASSIGNMENT.exec(line);
  if (!match) {
    return undefined;
  }
  return { key: match[2] ?? '', active: !match[1], value: match[3] ?? '' };
}

/** Variables mentionnées par un fichier ; une ligne active l'emporte, la dernière valeur aussi. */
function assignments(text: string): Map<string, Assignment> {
  const found = new Map<string, Assignment>();
  for (const line of text.split('\n')) {
    const assignment = parseLine(line);
    if (assignment && (assignment.active || !found.get(assignment.key)?.active)) {
      found.set(assignment.key, assignment);
    }
  }
  return found;
}

function declaredKeys(examples: readonly string[]): Set<string> {
  return new Set(examples.flatMap((example) => [...assignments(example).keys()]));
}

/** Variables définies dans le .env racine qui appartiennent maintenant au fichier d'une app. */
export function appKeysInRoot(root: string, appExamples: readonly string[]): string[] {
  const appKeys = declaredKeys(appExamples);
  return [...assignments(root).values()]
    .filter(({ key, active }) => active && appKeys.has(key))
    .map(({ key }) => key);
}

/**
 * L'exemple, avec les choix de l'ancien .env : ses valeurs, et ses variables commentées
 * (`AUTH_JWT_SECRET` ou `AUTH_JWKS_URL`, l'une ou l'autre).
 */
function fill(example: string, legacy: Map<string, Assignment>): string {
  return example
    .split('\n')
    .map((line) => {
      const assignment = parseLine(line);
      const previous = assignment && legacy.get(assignment.key);
      if (!assignment || !previous) {
        return line;
      }
      if (previous.active) {
        return `${assignment.key}=${previous.value}`;
      }
      return assignment.active ? `# ${line}` : line;
    })
    .join('\n');
}

export interface EnvExamples {
  root: string;
  apps: Record<string, string>;
}

/**
 * Répartit un ancien .env unique : chaque fichier part de son exemple, avec les valeurs de
 * l'ancien. Les variables qu'aucun exemple ne déclare (OTLP_PORT…) restent à la racine.
 */
export function splitLegacyEnv(
  legacy: string,
  examples: EnvExamples,
): { root: string; apps: Record<string, string> } {
  const previous = assignments(legacy);
  const known = declaredKeys([examples.root, ...Object.values(examples.apps)]);
  const unknown = legacy.split('\n').filter((line) => {
    const assignment = parseLine(line);
    return assignment?.active && !known.has(assignment.key);
  });
  const root = fill(examples.root, previous);
  return {
    root: unknown.length
      ? `${root.trimEnd()}\n\n# Reprises de l'ancien .env\n${unknown.join('\n')}\n`
      : root,
    apps: Object.fromEntries(
      Object.entries(examples.apps).map(([file, example]) => [file, fill(example, previous)]),
    ),
  };
}
