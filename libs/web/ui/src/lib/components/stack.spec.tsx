import { render } from '@testing-library/react';

import { Stack } from './stack';

describe('Stack', () => {
  it('rend une div en colonne avec un écart de 4 par défaut', () => {
    const { container } = render(<Stack>contenu</Stack>);
    const el = container.firstElementChild;
    expect(el?.tagName).toBe('DIV');
    expect(el).toHaveClass('flex', 'flex-col', 'gap-4');
  });

  it('applique la balise, la direction et l’écart demandés', () => {
    const { container } = render(
      <Stack as="ul" direction="row" gap={2}>
        <li>a</li>
      </Stack>,
    );
    const el = container.firstElementChild;
    expect(el?.tagName).toBe('UL');
    expect(el).toHaveClass('flex', 'flex-row', 'gap-2');
    expect(el).not.toHaveClass('flex-col');
  });
});
