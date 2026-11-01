import { render } from '@testing-library/react';

import { Stack } from './stack';

describe('Stack', () => {
  it('renders a column div with a gap of 4 by default', () => {
    const { container } = render(<Stack>contenu</Stack>);
    const el = container.firstElementChild;
    expect(el?.tagName).toBe('DIV');
    expect(el).toHaveClass('flex', 'flex-col', 'gap-4');
  });

  it('applies the requested tag, direction and gap', () => {
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

  it('passes role and aria-* to the rendered element', () => {
    const { container } = render(
      <Stack role="alert" aria-label="x">
        contenu
      </Stack>,
    );
    const el = container.firstElementChild;
    expect(el?.getAttribute('role')).toBe('alert');
    expect(el?.getAttribute('aria-label')).toBe('x');
  });
});
