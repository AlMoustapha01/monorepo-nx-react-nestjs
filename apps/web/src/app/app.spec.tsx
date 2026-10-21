import { render, screen } from '@testing-library/react';

import App from './app';

describe('App', () => {
  it('affiche le titre de niveau 1', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Boilerplate web');
  });
});
