# Référence : un domaine de l'API

À quoi ressemble chaque fichier d'un domaine `libs/api/<domaine>`, une fois les règles d'[`AGENTS.md`](../../AGENTS.md) appliquées. Les règles elles-mêmes sont dans `AGENTS.md` ; cette page montre leur forme dans le code, sur un domaine fictif **tickets** (agrégat `Ticket`, `open` → `closed`). Elle reste valable après `pnpm strip:examples`, qui retire les domaines d'exemple.

On part de `pnpm new:domain tickets` : la lib, sa config, sa façade et son module enregistré dans l'AppModule. Le reste s'écrit en TDD, dans l'ordre de cette page.

## Arborescence

```
libs/shared/contracts/src/lib/tickets/
  ticket.ts                       schémas zod (entrée, réponse, page), préfixe d'ID
  ticket.events.ts                événements d'intégration publiés, s'il y en a
libs/api/tickets/src/
  index.ts                        façade : module, façade, types de contrat ; rien d'autre
  lib/domain/
    ticket.ts                     l'agrégat, TypeScript pur
    tickets.errors.ts             TicketsError et ses codes
  lib/application/
    ticket.repository.ts          port de persistance
    use-cases/<cas-d-usage>.ts    un fichier par cas d'usage
    testing/in-memory-ticket.repository.ts
    tickets.application.spec.ts
  lib/infra/
    tickets.schema.ts             tables Drizzle (lu par drizzle-kit)
    ticket.mapper.ts
    drizzle-ticket.repository.ts
    drizzle-ticket.repository.int.spec.ts
  lib/http/tickets.controller.ts
  lib/tickets.module.ts
apps/api/tests/tickets.e2e.spec.ts
```

## Contrats (`libs/shared/contracts`)

Le front et l'API valident avec les mêmes schémas. Exporter le fichier depuis `src/index.ts` des contrats.

```ts
export const TICKET_ID_PREFIX = 'TCK';
export const ticketIdSchema = domainIdSchema(TICKET_ID_PREFIX);
export const ticketStatusSchema = z.enum(['open', 'closed']);

export const openTicketSchema = z.object({ title: z.string().trim().min(1).max(120) });
export type OpenTicketInput = z.infer<typeof openTicketSchema>;

export const ticketSchema = z.object({
  id: ticketIdSchema,
  title: z.string(),
  status: ticketStatusSchema,
  createdAt: z.iso.datetime(),
});
export type TicketResponse = z.infer<typeof ticketSchema>;
export const ticketPageSchema = cursorPageSchema(ticketSchema);
```

Les longueurs maximales sont des constantes exportées quand le domaine ou le front en ont besoin (message d'erreur, colonne `varchar`).

## Erreurs (`domain/tickets.errors.ts`)

Un code stable par cas, et sa catégorie (qui donne le statut HTTP dans `ProblemDetailsFilter`) :

```ts
const TICKETS_ERROR_KINDS = {
  TICKET_NOT_FOUND: 'NOT_FOUND',
  TICKET_VERSION_CONFLICT: 'CONFLICT',
  INVALID_TICKET: 'VALIDATION',
} as const satisfies Record<string, ErrorKind>;

export type TicketsErrorCode = keyof typeof TICKETS_ERROR_KINDS;

export class TicketsError extends AppError<TicketsErrorCode> {
  constructor(code: TicketsErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, TICKETS_ERROR_KINDS[code], message, details);
  }
}
```

## Agrégat (`domain/ticket.ts`)

Constructeur privé ; une fabrique qui applique les règles de création ; `restore` qui reconstruit depuis la base sans les rejouer ; des getters ; des méthodes de transition qui disent si quelque chose a changé ; `markPersisted` pour le verrou optimiste. Aucun import de NestJS, Drizzle ou `pg` (lint).

```ts
export class Ticket {
  private constructor(private props: TicketProps) {}

  static open({ now, ...input }: NewTicket): Ticket {
    const title = input.title.trim();
    if (title.length === 0 || title.length > TICKET_TITLE_MAX_LENGTH) {
      throw new TicketsError('INVALID_TICKET', 'title must be 1 to 120 characters', {
        field: 'title',
      });
    }
    return new Ticket({
      ...input,
      title,
      status: 'open',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: TicketProps): Ticket {
    return new Ticket({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  // … un getter par champ, dont tenantId, version, createdAt

  /** false si le ticket était déjà fermé : rien à écrire, rien à publier. */
  close(now: Date): boolean {
    if (this.props.status === 'closed') return false;
    this.props = { ...this.props, status: 'closed', updatedAt: now };
    return true;
  }

  /** Appelé par le repository après une écriture réussie. */
  markPersisted(): void {
    this.props = { ...this.props, version: this.props.version + 1 };
  }
}
```

`TicketProps` porte `id`, `tenantId`, les champs métier, `version`, `createdAt` et `updatedAt`. Test : `domain/ticket.spec.ts`, sans base ni Nest.

## Port de persistance (`application/ticket.repository.ts`)

```ts
export abstract class TicketRepository {
  abstract findById(id: string): Promise<Ticket | null>;
  /** Trié par (createdAt DESC, id DESC). */
  abstract list(query: { limit: number; after?: KeysetCursor; status?: TicketStatus }): Promise<{
    items: Ticket[];
    hasMore: boolean;
  }>;
  abstract insert(ticket: Ticket): Promise<void>;
  /** Écrit si la ligne est encore à `ticket.version`, sinon TICKET_VERSION_CONFLICT. */
  abstract update(ticket: Ticket): Promise<void>;
}
```

Aucune méthode ne prend de tenant : l'implémentation le lit dans `RequestContext`.

## Cas d'usage (`application/use-cases/`)

Une classe `@Injectable()` par cas d'usage, avec `execute`. Elle tire l'auteur et le tenant de `RequestContext`, applique les règles d'accès (404 sur une ressource qu'on ne peut pas voir), et ouvre une transaction quand elle publie un événement.

```ts
const newTicketId = domainIdGenerator(TICKET_ID_PREFIX);

@Injectable()
export class OpenTicket {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly context: RequestContext,
  ) {}

  async execute(input: OpenTicketInput): Promise<Ticket> {
    const ticket = Ticket.open({
      id: newTicketId(),
      tenantId: this.context.tenantId,
      authorId: this.context.userId,
      ...input,
      now: new Date(),
    });
    await this.tickets.insert(ticket);
    return ticket;
  }
}

@Injectable()
export class CloseTicket {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly transactions: TransactionManager,
    private readonly outbox: Outbox,
  ) {}

  async execute(id: string): Promise<Ticket> {
    const ticket = await this.tickets.findById(id);
    if (!ticket)
      throw new TicketsError('TICKET_NOT_FOUND', `Ticket ${id} not found`, { ticketId: id });
    if (!ticket.close(new Date())) return ticket; // déjà fermé : idempotent
    await this.transactions.transaction(async () => {
      await this.tickets.update(ticket);
      await this.outbox.publish(TicketClosed, {
        ticketId: ticket.id,
        closedAt: ticket.updatedAt.toISOString(),
      });
    });
    return ticket;
  }
}
```

Une liste par curseur décode `cursor` (`decodeCursor`) et renvoie `nextCursor: page.hasMore && last ? encodeCursor(last) : null`. Ce que le front a le droit de faire (`canManage`, `canReview`…) se calcule ici, avec `context.hasRole('staff')` : le front ne lit jamais les rôles.

## Fake en mémoire (`application/testing/in-memory-ticket.repository.ts`)

Il respecte le contrat du port : filtre par le tenant du `RequestContext`, tri keyset, refus d'une version périmée, et copie des agrégats (un test ne voit pas une mutation non écrite).

```ts
export class InMemoryTicketRepository extends TicketRepository {
  private readonly rows = new Map<string, Ticket>();

  constructor(private readonly context: RequestContext) {
    super();
  }

  async update(ticket: Ticket): Promise<void> {
    const stored = this.rows.get(ticket.id);
    if (stored?.tenantId !== this.context.tenantId || stored.version !== ticket.version) {
      throw new TicketsError(
        'TICKET_VERSION_CONFLICT',
        `Ticket ${ticket.id} was modified concurrently`,
      );
    }
    ticket.markPersisted();
    this.rows.set(ticket.id, clone(ticket));
  }
  // findById, list et insert : sur this.scoped(), les lignes du tenant courant, copiées
}
```

Les tests de la couche application (`tickets.application.spec.ts`) construisent les cas d'usage à la main avec ce fake, `createTestRequestContext()`, `InlineTransactionManager` et `RecordingOutbox` (`api-core/testing`), et s'exécutent dans `context.runAs({ userId, tenantId, roles }, …)`. Pour un ordre par date, figer l'horloge : `vi.useFakeTimers({ now, toFake: ['Date'] })`.

## Tables (`infra/tickets.schema.ts`)

Le fichier n'importe que `drizzle-orm` : drizzle-kit le lit pour générer les migrations.

```ts
const domainId = customType<{ data: string }>({ dataType: () => 'text COLLATE "C"' });

export const ticketsSchema = pgSchema('tickets');
export const ticketStatus = ticketsSchema.enum('ticket_status', ['open', 'closed']);

export const tickets = ticketsSchema.table(
  'tickets',
  {
    id: domainId('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    title: varchar('title', { length: 120 }).notNull(),
    status: ticketStatus('status').notNull(),
    version: integer('version').notNull().default(1),
    // Précision milliseconde, celle de Date : des curseurs exacts.
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull(),
  },
  (table) => [
    index('tickets_tenant_keyset_idx').on(table.tenantId, table.createdAt.desc(), table.id.desc()),
  ],
);
export type TicketRow = typeof tickets.$inferSelect;
```

Un index keyset par liste filtrée (par auteur, par statut…), qui commence par `tenant_id`. Puis `pnpm nx run api:db-generate --name=tickets`, et relire la migration générée.

## Mapper et repository Drizzle (`infra/`)

```ts
export class TicketMapper extends PersistenceMapper<Ticket, TicketRow> {
  toDomain(row: TicketRow): Ticket {
    return Ticket.restore({ ...row });
  }
  toRow(ticket: Ticket): TicketRow {
    return { id: ticket.id, tenantId: ticket.tenantId /* , … */ };
  }
}

@Injectable()
export class DrizzleTicketRepository extends TicketRepository {
  private readonly mapper = new TicketMapper();

  constructor(
    private readonly session: DatabaseSession,
    private readonly context: RequestContext,
  ) {
    super();
  }

  async list({ limit, after, status }: ListQuery) {
    const rows = await this.session.db
      .select()
      .from(tickets)
      .where(
        and(
          this.tenantScope(),
          status === undefined ? undefined : eq(tickets.status, status),
          after &&
            sql`(${tickets.createdAt}, ${tickets.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id})`,
        ),
      )
      .orderBy(desc(tickets.createdAt), desc(tickets.id))
      .limit(limit + 1);
    return { items: this.mapper.toDomainList(rows.slice(0, limit)), hasMore: rows.length > limit };
  }

  async insert(ticket: Ticket): Promise<void> {
    await this.session.db
      .insert(tickets)
      .values({ ...this.mapper.toRow(ticket), tenantId: this.context.tenantId });
  }

  async update(ticket: Ticket): Promise<void> {
    const { status, updatedAt, version } = this.mapper.toRow(ticket);
    const [written] = await this.session.db
      .update(tickets)
      .set({ status, updatedAt, version: version + 1 })
      .where(and(this.tenantScope(), eq(tickets.id, ticket.id), eq(tickets.version, version)))
      .returning({ id: tickets.id });
    if (!written)
      throw new TicketsError(
        'TICKET_VERSION_CONFLICT',
        `Ticket ${ticket.id} was modified concurrently`,
      );
    ticket.markPersisted();
  }

  /** Toute requête passe par ici : rien hors du tenant courant. */
  private tenantScope(): SQL {
    return eq(tickets.tenantId, this.context.tenantId);
  }
}
```

`this.session.db` rejoint la transaction ouverte par le cas d'usage, s'il y en a une. Un agrégat sur plusieurs tables écrit dans `this.session.transaction(…)` et charge ses lignes filles en une requête (`inArray`), pas une par parent.

Test d'intégration (`*.int.spec.ts`) : `startTestDatabase()` (Postgres jetable, migrations du repo appliquées), `new DrizzleTicketRepository(new DatabaseSession(database.db), context)`, et un cas par règle du port : relecture, pagination, chaque filtre, isolation entre tenants, version périmée refusée.

## Controller (`http/tickets.controller.ts`)

Couche fine : DTO zod, appel du cas d'usage, conversion en réponse. Aucune règle métier.

```ts
class OpenTicketDto extends createZodDto(openTicketSchema) {}
class TicketDto extends createZodDto(ticketSchema) {}
class TicketIdParamsDto extends createZodDto(z.object({ id: ticketIdSchema })) {}

@ApiTags('tickets')
@ApiBearerAuth()
@RequireFeature('tickets')
@Controller({ path: 'tickets', version: '1' })
export class TicketsController {
  constructor(
    private readonly openTicket: OpenTicket,
    private readonly closeTicket: CloseTicket,
  ) {}

  @Post()
  @Idempotent({ required: true })
  @ZodSerializerDto(TicketDto)
  async open(@Body() body: OpenTicketDto): Promise<TicketResponse> {
    return toResponse(await this.openTicket.execute(body));
  }

  @Post(':id/close')
  @RequireRole('staff')
  @HttpCode(200)
  @ZodSerializerDto(TicketDto)
  async close(@Param() { id }: TicketIdParamsDto): Promise<TicketResponse> {
    return toResponse(await this.closeTicket.execute(id));
  }
}

function toResponse(ticket: Ticket): TicketResponse {
  return {
    id: ticket.id,
    title: ticket.title,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
  };
}
```

## Module et façade

```ts
@Module({
  controllers: [TicketsController],
  providers: [
    { provide: TicketRepository, useClass: DrizzleTicketRepository },
    OpenTicket,
    CloseTicket,
  ],
})
export class TicketsModule {}
```

`RequestContext`, `FeatureFlags`, `Mailer`, `DatabaseSession`, `TransactionManager` et `Outbox` viennent de `CoreModule` (global) : rien à importer. Un domaine qui en consomme un autre importe son module, qui n'exporte que sa façade, et passe par un port et un adapter (`AGENTS.md`, « Règles de frontières »).

`src/index.ts` n'exporte que `TicketsModule`, une façade si d'autres domaines en ont besoin, et des types de contrat : jamais l'agrégat ni le repository.

## Réagir à un événement

Un handler, déclaré dans `providers` du module. Celui qui envoie un email ou appelle un service externe est hors transaction et passe l'ID de l'événement comme clé d'idempotence :

```ts
@Injectable()
@OnIntegrationEvent(TicketClosed, { name: 'tickets.closed-email', transactional: false })
export class SendTicketClosedEmail implements IntegrationEventHandler<typeof TicketClosed> {
  constructor(private readonly mailer: Mailer) {}

  async handle({ id, payload }: IntegrationEvent<typeof TicketClosed>): Promise<void> {
    if (!payload.authorEmail) return;
    await this.mailer.send({
      to: payload.authorEmail,
      idempotencyKey: id,
      ...ticketClosedEmail(payload),
    });
  }
}
```

Le contenu de l'email (`ticketClosedEmail`) est une fonction pure de `domain/`, testée seule ; le handler se teste avec `RecordingMailer` et `StaticFeatureFlags`.

## Tests end-to-end (`apps/api/tests/tickets.e2e.spec.ts`)

```ts
beforeAll(async () => {
  [database, redis] = await Promise.all([startTestDatabase(), startTestRedis()]);
  Object.assign(process.env, testEnv({ databaseUrl: database.url, redisUrl: redis.url }), {
    JOBS_ENABLED: 'false',
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FeatureFlags)
    .useValue(flags) // new StaticFeatureFlags()
    .compile();
  app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.init();
});

beforeEach(() => {
  flags.reset();
  flags.set('tickets', true);
});
```

Tokens : `signTestToken({ userId, tenantId, email, roles })`. Une route qui crée envoie `Idempotency-Key: randomUUID()`. À couvrir : chaque scénario d'acceptation au niveau API, le 403 sans le rôle, le 404 d'une ressource d'un autre tenant, le 404 `FEATURE_DISABLED` flag coupé. Pour un effet asynchrone (handler, email), `JOBS_ENABLED` reste à `true` et le test attend avec `eventually()` ; un email se lit dans un conteneur Mailpit (`SMTP_URL` pointé dessus, messages sur `/api/v1/messages`).
