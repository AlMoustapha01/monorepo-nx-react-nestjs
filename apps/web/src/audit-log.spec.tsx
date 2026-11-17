import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';

import { API, AUTH, renderAt, setupAppTest } from './testing/app-harness';

const server = setupAppTest();

const ADA = '6f9619ff-8b86-4011-b42d-00c04fc964ff';

const auditLog = () => [
  // option:feature-flags:start
  http.get(`${API}/feature-flags`, () => HttpResponse.json({ flags: { 'audit.log': true } })),
  // option:feature-flags:end
  http.get(`${AUTH}/organization/list-members`, () =>
    HttpResponse.json({
      members: [{ userId: ADA, role: 'owner', user: { name: 'Ada', email: 'ada@shop.test' } }],
    }),
  ),
];

describe('audit log', () => {
  it('shows the audit log of the tenant, filtered by the URL, and links to it', async () => {
    let query = '';
    server.use(
      ...auditLog(),
      http.get(`${API}/audit/entries`, ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json({
          items: [
            {
              id: 'AUD-00000000000000000001',
              actorId: ADA,
              action: 'identity.member-removed',
              resource: { type: 'member', id: ADA },
              details: { role: 'admin' },
              occurredAt: '2026-11-17T10:30:00.000Z',
              traceId: null,
            },
          ],
          nextCursor: null,
        });
      }),
    );
    renderAt('/journal?action=identity.member-removed&actorId=not-a-uuid');

    expect(await screen.findByText('Membre retiré')).toBeTruthy();
    expect(query).toContain('action=identity.member-removed');
    // Un filtre invalide dans l'URL est ignoré.
    expect(query).not.toContain('actorId');
    expect(screen.getByRole('link', { name: 'Journal d’audit' }).getAttribute('href')).toBe(
      '/journal',
    );
  });

  // option:feature-flags:start
  it('is absent while audit.log is off: no link, and a 404 page', async () => {
    renderAt('/journal');

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('404 : page introuvable');
    expect(screen.queryByRole('link', { name: 'Journal d’audit' })).toBeNull();
  });
  // option:feature-flags:end
});
