import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseErrorKinds,
  renderErrorCodes,
  replaceGenerated,
  sameContent,
} from './error-codes-core.mts';

// Construits par interpolation : strip:examples retirerait des marqueurs écrits en clair.
const EXAMPLE_START = `<!-- example:${'start'} -->`;
const EXAMPLE_END = `<!-- example:${'end'} -->`;

const SOURCE = `import { AppError, type ErrorKind } from '@nx-react-nestjs/api-core';

/** Codes stables exposés aux clients ; la catégorie décide du statut HTTP. */
const BILLING_ERROR_KINDS = {
  INVOICE_NOT_FOUND: 'NOT_FOUND',
  /** Deux écritures concurrentes : la seconde doit relire et réessayer. */
  INVOICE_VERSION_CONFLICT: 'CONFLICT',
  /**
   * Montant négatif ou nul.
   */
  INVALID_AMOUNT: 'VALIDATION',
} as const satisfies Record<string, ErrorKind>;
`;

describe('parseErrorKinds', () => {
  it('lit chaque code, sa catégorie et son commentaire', () => {
    assert.deepEqual(parseErrorKinds(SOURCE), [
      { code: 'INVOICE_NOT_FOUND', kind: 'NOT_FOUND', description: '' },
      {
        code: 'INVOICE_VERSION_CONFLICT',
        kind: 'CONFLICT',
        description: 'Deux écritures concurrentes : la seconde doit relire et réessayer.',
      },
      { code: 'INVALID_AMOUNT', kind: 'VALIDATION', description: 'Montant négatif ou nul.' },
    ]);
  });

  it('ne trouve rien dans un fichier sans table de codes', () => {
    assert.deepEqual(parseErrorKinds('export const x = 1;'), []);
  });
});

describe('renderErrorCodes', () => {
  const entries = parseErrorKinds(SOURCE);

  it('donne une section par lib, avec le statut HTTP de chaque catégorie', () => {
    const text = renderErrorCodes([
      {
        name: 'billing',
        file: 'libs/api/billing/src/lib/domain/billing.errors.ts',
        example: false,
        entries,
      },
    ]);
    assert.match(text, /### `billing`/);
    assert.match(text, /`libs\/api\/billing\/src\/lib\/domain\/billing\.errors\.ts`/);
    assert.match(text, /\| `INVOICE_NOT_FOUND` \| 404 \| `NOT_FOUND` \| {2}\|/);
    assert.match(text, /\| `INVOICE_VERSION_CONFLICT` \| 409 \| `CONFLICT` \| Deux écritures/);
  });

  it('entoure la section d’un domaine d’exemple de marqueurs example', () => {
    const lines = renderErrorCodes([
      { name: 'billing', file: 'libs/api/billing/src/x.errors.ts', example: true, entries },
    ]).split('\n');
    assert.equal(lines[0], EXAMPLE_START);
    assert.equal(lines.at(-2), EXAMPLE_END);
  });

  it('refuse une catégorie inconnue', () => {
    assert.throws(
      () =>
        renderErrorCodes([
          {
            name: 'billing',
            file: 'x.ts',
            example: false,
            entries: [{ code: 'X', kind: 'TEAPOT', description: '' }],
          },
        ]),
      /TEAPOT/,
    );
  });
});

describe('replaceGenerated', () => {
  const DOC = 'avant\n<!-- error-codes:start -->\nancien\n<!-- error-codes:end -->\naprès\n';

  it('remplace seulement le bloc généré', () => {
    assert.equal(
      replaceGenerated(DOC, 'nouveau\n'),
      'avant\n<!-- error-codes:start -->\nnouveau\n<!-- error-codes:end -->\naprès\n',
    );
  });

  it('refuse une page sans marqueurs', () => {
    assert.throws(() => replaceGenerated('rien', 'x'), /error-codes:start/);
  });
});

describe('sameContent', () => {
  it('ignore l’alignement des tableaux fait par le formateur', () => {
    assert.ok(
      sameContent(
        '| Code | Statut |\n| --- | --- |\n| `A` | 404 |\n',
        '| Code   | Statut |\n| ------ | ------ |\n| `A`    | 404    |\n',
      ),
    );
  });

  it('ignore les lignes vides ajoutées par le formateur autour des marqueurs', () => {
    assert.ok(sameContent(`${EXAMPLE_START}\n### \`a\`\n`, `${EXAMPLE_START}\n\n### \`a\`\n`));
  });

  it('voit un code ajouté', () => {
    assert.ok(!sameContent('| `A` | 404 |\n', '| `A` | 404 |\n| `B` | 409 |\n'));
  });
});
