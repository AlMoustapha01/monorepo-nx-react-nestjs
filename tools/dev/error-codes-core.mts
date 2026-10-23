/**
 * Référence des codes d'erreur (docs/reference/codes-erreur.md), générée depuis les tables
 * `*_ERROR_KINDS` d'api-core et des domaines. Logique pure ; les fichiers sont dans error-codes.mts.
 */

export interface ErrorCodeEntry {
  code: string;
  kind: string;
  description: string;
}

export interface ErrorCodeSection {
  /** `api-core` ou le nom du domaine. */
  name: string;
  file: string;
  /** Domaine d'exemple : sa section est retirée par `pnpm strip:examples`. */
  example: boolean;
  entries: ErrorCodeEntry[];
}

/** Même correspondance que `STATUS_BY_KIND` de `ProblemDetailsFilter`. */
const STATUS_BY_KIND: Record<string, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  BUSINESS_RULE: 422,
  INTERNAL: 500,
};

const START = '<!-- error-codes:start -->';
const END = '<!-- error-codes:end -->';
// Construits par interpolation : strip:examples ne doit pas les prendre pour des blocs de ce fichier.
const EXAMPLE_START = `<!-- example:${'start'} -->`;
const EXAMPLE_END = `<!-- example:${'end'} -->`;

const TABLE = /const\s+\w+_ERROR_KINDS\s*=\s*\{([\s\S]*?)\}\s*as const/;
const ENTRY = /^([A-Z][A-Z0-9_]*):\s*'([A-Z_]+)',?$/;

/** Codes d'une table `const X_ERROR_KINDS = { CODE: 'KIND', … } as const`, avec leur commentaire. */
export function parseErrorKinds(source: string): ErrorCodeEntry[] {
  const body = TABLE.exec(source)?.[1];
  if (body === undefined) return [];

  const entries: ErrorCodeEntry[] = [];
  let comment: string[] = [];
  let inComment = false;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('/**') || inComment) {
      inComment = !line.endsWith('*/');
      const text = line
        .replace(/^\/\*\*/, '')
        .replace(/\*\/$/, '')
        .replace(/^\*/, '')
        .trim();
      if (text) comment.push(text);
      continue;
    }
    const match = ENTRY.exec(line);
    if (match) {
      entries.push({ code: match[1], kind: match[2], description: comment.join(' ') });
      comment = [];
    }
  }
  return entries;
}

/** Une section Markdown par lib : code, statut HTTP, catégorie, signification. */
export function renderErrorCodes(sections: ErrorCodeSection[]): string {
  return sections
    .map((section) => {
      const rows = section.entries.map((entry) => {
        const status = STATUS_BY_KIND[entry.kind];
        if (status === undefined) {
          throw new Error(
            `${section.file} : catégorie inconnue ${entry.kind} pour ${entry.code} (STATUS_BY_KIND à mettre à jour).`,
          );
        }
        return `| \`${entry.code}\` | ${status} | \`${entry.kind}\` | ${entry.description} |`;
      });
      const lines = [
        `### \`${section.name}\``,
        '',
        `Source : \`${section.file}\``,
        '',
        '| Code | Statut | Catégorie | Signification |',
        '| --- | --- | --- | --- |',
        ...rows,
        '',
      ];
      return (section.example ? [EXAMPLE_START, ...lines, EXAMPLE_END, ''] : lines).join('\n');
    })
    .join('\n');
}

/** Remplace le contenu entre les marqueurs `error-codes:start` et `error-codes:end`. */
export function replaceGenerated(doc: string, generated: string): string {
  const start = doc.indexOf(START);
  const end = doc.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Marqueurs ${START} et ${END} introuvables.`);
  }
  return `${doc.slice(0, start + START.length)}\n${generated}${doc.slice(end)}`;
}

/**
 * Compare deux textes sans tenir compte de ce que change le formateur : alignement des tableaux,
 * lignes vides autour des commentaires HTML.
 */
export function sameContent(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}

function normalize(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line.startsWith('|')
        ? line
            .split('|')
            .map((cell) => (/^\s*-+\s*$/.test(cell) ? '---' : cell.trim()))
            .join('|')
        : line.trimEnd(),
    )
    .filter(Boolean)
    .join('\n');
}
