import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { envSchema } from './env';

const REFERENCE = join(__dirname, '../../../../../../docs/reference/variables-environnement.md');

describe('envSchema', () => {
  it('a chaque variable documentée dans la référence', () => {
    const reference = readFileSync(REFERENCE, 'utf8');
    const undocumented = Object.keys(envSchema.shape).filter(
      (name) => !reference.includes(`| \`${name}\``),
    );
    expect(undocumented).toEqual([]);
  });
});
