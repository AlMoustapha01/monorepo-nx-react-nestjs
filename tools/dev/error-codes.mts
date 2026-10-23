/**
 * Régénère la référence des codes d'erreur depuis les tables `*_ERROR_KINDS` de libs/api.
 *   pnpm docs:errors          → réécrit docs/reference/codes-erreur.md
 *   pnpm docs:errors --check  → code de sortie 1 si la page n'est plus à jour (CI)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  type ErrorCodeSection,
  parseErrorKinds,
  renderErrorCodes,
  replaceGenerated,
  sameContent,
} from './error-codes-core.mts';
import { EXAMPLE_PATHS } from './strip-examples-core.mts';

const REFERENCE = 'docs/reference/codes-erreur.md';
const SOURCE_FILE = /^libs\/api\/([^/]+)\/src\/.+\.ts$/;

function sections(): ErrorCodeSection[] {
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', 'libs/api'],
    {
      encoding: 'utf8',
    },
  )
    .split('\n')
    .filter((file) => SOURCE_FILE.test(file) && !file.endsWith('.spec.ts'))
    .sort();

  const found: ErrorCodeSection[] = [];
  for (const file of files) {
    const entries = parseErrorKinds(readFileSync(file, 'utf8'));
    if (entries.length === 0) continue;
    const lib = SOURCE_FILE.exec(file)![1];
    found.push({
      name: lib === 'core' ? 'api-core' : lib,
      file,
      example: EXAMPLE_PATHS.includes(`libs/api/${lib}`),
      entries,
    });
  }
  // api-core d'abord : ses codes valent pour toutes les routes.
  return found.sort((a, b) => Number(b.name === 'api-core') - Number(a.name === 'api-core'));
}

const current = readFileSync(REFERENCE, 'utf8');
const expected = replaceGenerated(current, renderErrorCodes(sections()));

if (process.argv.includes('--check')) {
  if (!sameContent(current, expected)) {
    console.error(`${REFERENCE} n'est plus à jour : lancez pnpm docs:errors.`);
    process.exit(1);
  }
  console.log(`${REFERENCE} : à jour.`);
} else {
  writeFileSync(REFERENCE, expected);
  execFileSync('pnpm', ['exec', 'oxfmt', REFERENCE], { stdio: 'inherit' });
  console.log(`${REFERENCE} régénéré.`);
}
