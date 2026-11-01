import { render } from '@testing-library/react';

import { Text } from './text';

describe('Text', () => {
  it('passes id and aria-* to the rendered element', () => {
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
