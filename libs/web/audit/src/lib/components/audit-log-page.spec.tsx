import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuditEntryResponse } from '@nx-react-nestjs/contracts';
import { createApiClient, createAuthClient } from '@nx-react-nestjs/web-data-access';

import { renderWithProviders } from '../../test-utils';
import { AuditLogPage, type AuditFilters } from './audit-log-page';

const API = 'http://localhost:3000/api/v1';
const AUTH = 'http://auth.test';
const api = createApiClient({ baseUrl: API });
const auth = createAuthClient({ baseUrl: AUTH });
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

const ADA = '6f9619ff-8b86-4011-b42d-00c04fc964ff';
const GONE = '0e8f2d5e-1c1e-4a54-b1d4-8c2f9a7b6d01';

function entry(n: number, overrides: Partial<AuditEntryResponse> = {}): AuditEntryResponse {
  return {
    id: `AUD-${String(n).padStart(20, '0')}`,
    actorId: ADA,
    action: 'identity.member-removed',
    resource: { type: 'member', id: GONE },
    details: { role: 'admin' },
    occurredAt: '2026-11-17T10:30:00.000Z',
    traceId: null,
    ...overrides,
  };
}

const members = () =>
  http.get(`${AUTH}/api/auth/organization/list-members`, () =>
    HttpResponse.json({
      members: [
        { userId: ADA, role: 'owner', user: { name: 'Ada Lovelace', email: 'ada@shop.test' } },
      ],
    }),
  );

const entries = (items: AuditEntryResponse[], nextCursor: string | null = null) =>
  http.get(`${API}/audit/entries`, () => HttpResponse.json({ items, nextCursor }));

function render(
  filters: AuditFilters = {},
  onFiltersChange = vi.fn<(filters: AuditFilters) => void>(),
) {
  return renderWithProviders(
    <AuditLogPage api={api} auth={auth} filters={filters} onFiltersChange={onFiltersChange} />,
  );
}

const findList = () => screen.findByRole('list', { name: 'Journal d’audit' });

describe('AuditLogPage', () => {
  it('lists the actions, newest first, with the name of their author', async () => {
    server.use(
      members(),
      entries([
        entry(2),
        entry(1, {
          action: 'identity.signed-in',
          resource: { type: 'user', id: ADA },
          details: {},
        }),
      ]),
    );
    await render();

    const list = await findList();
    const [removal, signIn] = within(list).getAllByRole('listitem');
    expect(removal?.textContent).toContain('Membre retiré');
    expect(removal?.textContent).toContain('role : admin');
    expect(signIn?.textContent).toContain('Connexion');
    expect(await within(list).findAllByRole('button', { name: /Ada Lovelace/ })).toHaveLength(2);
  });

  it('names an author who is no longer a member, and a system action', async () => {
    server.use(members(), entries([entry(2, { actorId: GONE }), entry(1, { actorId: null })]));
    await render();

    const list = await findList();
    expect(await within(list).findByRole('button', { name: /Ancien membre/ })).toBeTruthy();
    expect(within(list).getByText('Système')).toBeTruthy();
  });

  it('names the platform support who entered an account, and what it did there', async () => {
    const OPERATOR = '3b241101-e2bb-4255-8caf-4136c566a962';
    server.use(
      members(),
      entries([
        entry(3, {
          actorId: OPERATOR,
          action: 'identity.impersonation-stopped',
          resource: { type: 'user', id: ADA },
          details: {},
        }),
        entry(2, { action: 'orders.order-placed', impersonatorId: OPERATOR, details: {} }),
        entry(1, {
          actorId: OPERATOR,
          action: 'identity.impersonation-started',
          resource: { type: 'user', id: ADA },
          details: {},
        }),
      ]),
    );
    await render();

    const [stopped, placed, started] = within(await findList()).getAllByRole('listitem');
    expect(started?.textContent).toContain('Le support est entré dans le compte');
    expect(started?.textContent).toContain('Support de la plateforme');
    expect(stopped?.textContent).toContain('Le support a quitté le compte');
    // Fait par le support au nom d'Ada : les deux sont nommés.
    await vi.waitFor(() => expect(placed?.textContent).toContain('Ada Lovelace'));
    expect(placed?.textContent).toContain('via le support de la plateforme');
  });

  it('shows an unknown action as it is recorded', async () => {
    server.use(members(), entries([entry(1, { action: 'billing.invoice-paid' })]));
    await render();

    expect(within(await findList()).getByText('billing.invoice-paid')).toBeTruthy();
  });

  it('still lists the actions when the members cannot be read', async () => {
    server.use(
      http.get(`${AUTH}/api/auth/organization/list-members`, () => HttpResponse.error()),
      entries([entry(1)]),
    );
    await render();

    expect(within(await findList()).getByText('Membre retiré')).toBeTruthy();
  });

  it('filters by action and by author through the URL', async () => {
    const requested: string[] = [];
    const onFiltersChange = vi.fn<(filters: AuditFilters) => void>();
    server.use(
      members(),
      http.get(`${API}/audit/entries`, ({ request }) => {
        requested.push(new URL(request.url).search);
        return HttpResponse.json({ items: [entry(1)], nextCursor: null });
      }),
    );
    await render({ action: 'identity.member-removed' }, onFiltersChange);

    await findList();
    expect(requested[0]).toContain('action=identity.member-removed');
    await userEvent.selectOptions(screen.getByLabelText('Action'), 'identity.signed-in');
    expect(onFiltersChange).toHaveBeenLastCalledWith({ action: 'identity.signed-in' });
    await userEvent.click(await screen.findByRole('button', { name: /Ada Lovelace/ }));
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      action: 'identity.member-removed',
      actorId: ADA,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Effacer les filtres' }));
    expect(onFiltersChange).toHaveBeenLastCalledWith({});
  });

  it('loads the next page on demand', async () => {
    server.use(
      members(),
      http.get(`${API}/audit/entries`, ({ request }) =>
        new URL(request.url).searchParams.get('cursor') === 'next'
          ? HttpResponse.json({ items: [entry(1)], nextCursor: null })
          : HttpResponse.json({ items: [entry(2)], nextCursor: 'next' }),
      ),
    );
    await render();

    await userEvent.click(await screen.findByRole('button', { name: 'Voir plus' }));
    const list = await findList();
    await vi.waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
  });

  it('says when the log is empty', async () => {
    server.use(members(), entries([]));
    await render();

    expect(await screen.findByText('Aucune action enregistrée.')).toBeTruthy();
  });

  it('tells a member without the administrator role that the log is not for them', async () => {
    server.use(
      members(),
      http.get(`${API}/audit/entries`, () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Forbidden', status: 403, code: 'FORBIDDEN' },
          { status: 403, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );
    await render();

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Le journal d’audit est réservé aux administrateurs de l’organisation.',
    );
  });
});
