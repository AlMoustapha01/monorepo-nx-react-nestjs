import { screen } from '@testing-library/react';

import { renderWithProviders } from '../../test-utils';
import { StorefrontNav } from './storefront-nav';

describe('StorefrontNav', () => {
  it('links to the catalog, the orders and the cart', async () => {
    await renderWithProviders(<StorefrontNav />, {
      routes: ['/boutique', '/commandes', '/panier'],
    });
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/boutique',
      '/commandes',
      '/panier',
    ]);
    expect(screen.getByRole('link', { name: 'Boutique' })).toBeTruthy();
  });
});
