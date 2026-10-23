# Référence : une lib feature du front

À quoi ressemble une lib `libs/web/<feature>` et la route qui l'assemble, une fois les règles de [`libs/web/AGENTS.md`](../../libs/web/AGENTS.md) et [`apps/web/AGENTS.md`](../../apps/web/AGENTS.md) appliquées. La suite de l'exemple fictif **tickets** de la [référence API](domaine-api.md) : une page qui liste les tickets et un formulaire pour en ouvrir un. Elle reste valable après `pnpm strip:examples`.

On part de `pnpm new:web-feature tickets` : la lib, sa config (Vitest avec la macro Lingui, `passWithNoTests`), `src/test-utils.tsx` et l'alias `@nx-react-nestjs/web-tickets`.

## Arborescence

```
libs/web/tickets/src/
  index.ts                         façade : exports nommés de ce qu'utilise apps/web
  test-utils.tsx                   renderWithProviders (généré)
  lib/data/keys.ts                 clés de requête
  lib/data/tickets.ts              appels à l'API et fabriques de requêtes
  lib/hooks/use-open-ticket.ts     mutations
  lib/components/tickets-page.tsx  écrans, avec leur test *.spec.tsx à côté
apps/web/src/routes/_authenticated/tickets.tsx   la route, fine
apps/web/src/components/app-navigation.tsx      le lien, derrière le flag
apps/web/src/locales/{fr,en}/messages.po         catalogues
apps/web-e2e/src/accessibility.spec.ts           la nouvelle page y entre
```

## Données (`data/`)

Une clé par ressource, une fabrique de requête avec un `staleTime` explicite, et des réponses validées par les schémas des contrats. Tout appel passe par `api.request` (le seul `fetch` est dans `web-data-access`).

```ts
export const ticketsKeys = {
  all: () => ['tickets'] as const,
  list: () => ['tickets', 'list'] as const,
};

export function ticketsInfiniteQueryOptions(api: ApiClient) {
  return infiniteQueryOptions({
    queryKey: ticketsKeys.list(),
    staleTime: 30_000,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.request('/tickets', {
        query: { limit: 20, cursor: pageParam },
        schema: ticketPageSchema,
        signal,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function openTicket(api: ApiClient, input: OpenTicketInput, idempotencyKey: string) {
  return api.request('/tickets', {
    method: 'POST',
    body: input,
    idempotencyKey,
    schema: ticketSchema,
  });
}
```

## Mutation (`hooks/`)

Une création passe par `useIdempotentMutation` : une `Idempotency-Key` par envoi, réutilisée par les retries. Les échecs déclenchent déjà le toast (`onMutationError` de `createQueryClient`).

```ts
export function useOpenTicket(api: ApiClient) {
  const queryClient = useQueryClient();
  return useIdempotentMutation<TicketResponse, OpenTicketInput>({
    mutationFn: (input, idempotencyKey) => openTicket(api, input, idempotencyKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ticketsKeys.all() }),
  });
}
```

## Formulaire

`react-hook-form` et le schéma zod des contrats ; les champs de `web-ui` (`FormField`, `TextareaField`, `FormError`) relient libellé, `aria-invalid` et message. Le message affiché vient du composant, localisé, jamais du texte de zod.

```tsx
export function TicketForm({ api }: { api: ApiClient }) {
  const { t } = useLingui();
  const openTicket = useOpenTicket(api);
  const form = useForm<OpenTicketInput>({
    resolver: zodResolver(openTicketSchema),
    defaultValues: { title: '' },
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit(async (input) => {
    await openTicket.mutateAsync(input);
    form.reset();
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event).catch(() => undefined)}>
      <Stack gap={4}>
        <FormField
          label={t`Titre`}
          error={errors.title && t`Saisissez un titre de 120 caractères au plus.`}
          {...form.register('title')}
        />
        <Button type="submit" disabled={openTicket.isPending}>
          <Trans>Ouvrir le ticket</Trans>
        </Button>
      </Stack>
    </form>
  );
}
```

## Écran (`components/`)

Le composant reçoit `api` (et des booléens pour ce qui dépend d'un flag) : une lib ne lit ni les flags ni les rôles. Il gère chargement, erreur, liste vide et « Voir plus ». Mise en page avec `Stack`, `Text`, `Heading` ; aucune chaîne en dur (`<Trans>`, `t`).

```tsx
export function TicketsPage({ api }: { api: ApiClient }) {
  const { t } = useLingui();
  const { data, isPending, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery(ticketsInfiniteQueryOptions(api));
  const tickets = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Stack as="section" gap={6} className="p-4">
      <Heading level={1}>
        <Trans>Tickets</Trans>
      </Heading>
      <TicketForm api={api} />
      {isPending ? (
        <Text aria-live="polite">
          <Trans>Chargement…</Trans>
        </Text>
      ) : isError && tickets.length === 0 ? (
        <Text role="alert" tone="destructive">
          <Trans>Impossible de charger les tickets.</Trans>
        </Text>
      ) : tickets.length === 0 ? (
        <Text tone="muted">
          <Trans>Aucun ticket pour l’instant.</Trans>
        </Text>
      ) : (
        <Stack as="ul" aria-label={t`Tickets`}>
          {tickets.map((ticket) => (
            <li key={ticket.id} className="list-none">
              {/* une Card par ticket */}
            </li>
          ))}
        </Stack>
      )}
      {hasNextPage && (
        <Button
          variant="outline"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          <Trans>Voir plus</Trans>
        </Button>
      )}
    </Stack>
  );
}
```

Un composant qui manque dans `web-ui` s'y ajoute, avec sa story (les stories sont exécutées comme tests) : voir [Design system](../guides/design-system.md).

## Tests de composants (`*.spec.tsx`)

Réseau simulé avec MSW, rendu par `renderWithProviders` (i18n, React Query, routeur mémoire), requêtes par rôle et nom accessible, `user-event` pour les interactions.

```tsx
const API = 'http://localhost:3000/api/v1';
const api = createApiClient({ baseUrl: API });
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

it('004-US1-AS1: ouvre un ticket et le montre dans la liste', async () => {
  const items: TicketResponse[] = [];
  server.use(
    http.get(`${API}/tickets`, () => HttpResponse.json({ items, nextCursor: null })),
    http.post(`${API}/tickets`, async ({ request }) => {
      const created = { ...ticket(1), ...((await request.json()) as object) };
      items.unshift(created);
      return HttpResponse.json(created, { status: 201 });
    }),
  );
  await renderWithProviders(<TicketsPage api={api} />);

  await userEvent.type(screen.getByLabelText('Titre'), 'Imprimante en panne');
  await userEvent.click(screen.getByRole('button', { name: 'Ouvrir le ticket' }));

  const list = await screen.findByRole('list', { name: 'Tickets' });
  expect(within(list).getByText('Imprimante en panne')).toBeTruthy();
});
```

`renderWithProviders(ui, { path, routes })` rend aussi des routes factices, pour vérifier une navigation.

## Route et navigation (`apps/web`)

La route ne fait qu'assembler : garde du flag, contexte, `ErrorZone`.

```tsx
function Tickets() {
  const { api } = Route.useRouteContext();
  return (
    <ErrorZone>
      <TicketsPage api={api} />
    </ErrorZone>
  );
}

export const Route = createFileRoute('/_authenticated/tickets')({
  beforeLoad: requireFeature('tickets'),
  component: Tickets,
});
```

Le lien de navigation, dans `AppNavigation`, lit le flag avec `useFeatureFlag('tickets')`. Un test de l'app (`apps/web/src/*.spec.tsx`, banc commun `src/testing/app-harness.tsx`) vérifie le lien avec le flag actif, son absence et le 404 avec le flag coupé. `routeTree.gen.ts` se régénère au build et aux tests.

## Traductions

```sh
cd apps/web && pnpm exec lingui extract --clean   # puis traduire les msgstr vides de en/messages.po
pnpm nx run web:i18n-check                         # comme la CI ; committer les catalogues
```

## Accessibilité et parcours

La page entre dans `apps/web-e2e/src/accessibility.spec.ts` (axe, WCAG 2.1 AA), formulaire en erreur compris, et son flag dans `E2E_FEATURE_FLAGS` (`apps/web-e2e/src/stack.ts`). Après `signIn`, attendre la page d'accueil avant de naviguer :

```ts
test('la page des tickets est accessible', async ({ page }) => {
  const account = await createAccount('a11y-tickets');
  await createOrganization(account, 'Atelier');
  await page.goto('/connexion');
  await signIn(page, account.email);
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();
  await page.getByRole('link', { name: 'Tickets' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tickets' })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
});
```

Un parcours Playwright de plus ne se justifie que pour ce que Vitest ne voit pas : redirections entre services, emails, cookies, plusieurs tenants.
