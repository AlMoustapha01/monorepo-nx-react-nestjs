import { http, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AUTH, auth, betterAuthError, server } from '../../test-server';
import { renderWithProviders } from '../../test-utils';
import { BackOfficePage } from './back-office-page';

const BOB = {
  id: 'u2',
  email: 'bob@shop.test',
  name: 'Bob',
  organizations: [{ id: 'o1', name: 'Atelier', role: 'owner' }],
};

/** Service d'identité simulé : un flag `x.beta`, coupé par le catalogue, sans surcharge au départ. */
function serveFlags() {
  const state = { override: null as boolean | null, posted: [] as unknown[] };
  const tenant = () => ({
    organization: { id: 'o1', name: 'Atelier' },
    flags: [
      {
        flag: 'x.beta',
        description: 'Nouvelle page en bêta.',
        catalogDefault: false,
        override: state.override,
      },
    ],
  });
  server.use(
    http.get(`${AUTH}/operator/search`, () => HttpResponse.json({ users: [BOB] })),
    http.get(`${AUTH}/operator/feature-flags`, () => HttpResponse.json(tenant())),
    http.post(`${AUTH}/operator/feature-flags`, async ({ request }) => {
      const body = (await request.json()) as { value: string };
      state.posted.push(body);
      state.override = body.value === 'default' ? null : body.value === 'on';
      return HttpResponse.json(tenant());
    }),
  );
  return state;
}

async function openFlags() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email, nom ou organisation'), 'bob');
  await user.click(screen.getByRole('button', { name: 'Rechercher' }));
  await user.click(await screen.findByRole('button', { name: 'Flags de Atelier' }));
  return { user, panel: await screen.findByRole('region', { name: 'Flags de Atelier' }) };
}

describe('BackOfficePage, feature flags of a tenant', () => {
  it('turns a flag on for one organization, then back to the value for all', async () => {
    const state = serveFlags();
    await renderWithProviders(
      <BackOfficePage auth={auth} featureFlags onImpersonated={vi.fn<() => void>()} />,
    );
    const { user, panel } = await openFlags();

    expect(within(panel).getByText('Nouvelle page en bêta.')).toBeTruthy();
    const value = within(panel).getByLabelText<HTMLSelectElement>('Valeur de x.beta');
    expect(value.value).toBe('default');
    expect(within(value).getByRole('option', { name: 'Comme tous (désactivé)' })).toBeTruthy();

    await user.selectOptions(value, 'on');
    await vi.waitFor(() => expect(state.override).toBe(true));
    await vi.waitFor(() => expect(value.value).toBe('on'));
    await user.selectOptions(value, 'default');
    await vi.waitFor(() => expect(value.value).toBe('default'));
    expect(state.posted).toEqual([
      { organizationId: 'o1', flag: 'x.beta', value: 'on' },
      { organizationId: 'o1', flag: 'x.beta', value: 'default' },
    ]);
  });

  it('says why a change is refused, and keeps the current value', async () => {
    serveFlags();
    server.use(
      http.post(`${AUTH}/operator/feature-flags`, () =>
        betterAuthError(403, 'OPERATOR_TWO_FACTOR_REQUIRED'),
      ),
    );
    await renderWithProviders(
      <BackOfficePage auth={auth} featureFlags onImpersonated={vi.fn<() => void>()} />,
    );
    const { user, panel } = await openFlags();

    const value = within(panel).getByLabelText<HTMLSelectElement>('Valeur de x.beta');
    await user.selectOptions(value, 'on');
    expect(
      await within(panel).findByText(
        'Activez la vérification en deux étapes sur votre compte avant de voir celui d’un client.',
      ),
    ).toBeTruthy();
    expect(value.value).toBe('default');
  });

  it('has no flags without the option', async () => {
    serveFlags();
    await renderWithProviders(<BackOfficePage auth={auth} onImpersonated={vi.fn<() => void>()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email, nom ou organisation'), 'bob');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
    await screen.findByRole('list', { name: 'Comptes trouvés' });
    expect(screen.queryByRole('button', { name: 'Flags de Atelier' })).toBeNull();
  });
});
