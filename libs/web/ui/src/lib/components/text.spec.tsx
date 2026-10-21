import { render } from '@testing-library/react';

import { Text } from './text';

describe('Text', () => {
  it('transmet id et aria-* à l’élément rendu', () => {
    const { container } = render(
      <Text id="t" aria-live="polite">
        contenu
      </Text>,
    );
    const el = container.firstElementChild;
    expect(el?.id).toBe('t');
    expect(el?.getAttribute('aria-live')).toBe('polite');
  });
});
