import { render, screen } from '@testing-library/react';

import { Heading } from './heading';

describe('Heading', () => {
  it('rend la balise correspondant au niveau', () => {
    render(<Heading level={2}>Titre</Heading>);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Titre');
  });
});
