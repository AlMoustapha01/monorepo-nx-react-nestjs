/**
 * Génère un JWT de dev, signé avec le secret de .env.
 *   pnpm -s dev:token                      → client de dev (voit le catalogue publié, ses commandes)
 *   pnpm -s dev:token --staff              → staff de dev (gère le catalogue, voit tout le tenant)
 *   pnpm -s dev:token --tenant <uuid> --user <uuid> --email a@b.c --expires 1h
 *   TOKEN=$(pnpm -s dev:token) && curl -H "authorization: Bearer $TOKEN" …
 * Avec le service d'auth (AUTH_JWKS_URL dans .env) : un vrai token de 15 min, celui d'un compte de
 * démo créé par `pnpm dev:seed` ; les options d'identité ne s'appliquent pas.
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { demoToken, usesAuthService } from './auth-service.mts';
import { DEV_EMAIL, DEV_TENANT_ID, DEV_USER_ID, signDevToken } from './dev-env.mts';

const { values } = parseArgs({
  options: {
    tenant: { type: 'string', default: DEV_TENANT_ID },
    user: { type: 'string', default: DEV_USER_ID },
    email: { type: 'string', default: DEV_EMAIL },
    'no-email': { type: 'boolean', default: false },
    staff: { type: 'boolean', default: false },
    'new-tenant': { type: 'boolean', default: false },
    expires: { type: 'string', default: '12h' },
  },
});

const IDENTITY_OPTIONS = ['tenant', 'user', 'email', 'no-email', 'new-tenant', 'expires'] as const;
if (usesAuthService() && IDENTITY_OPTIONS.some((option) => process.argv.includes(`--${option}`))) {
  console.error(`Avec AUTH_JWKS_URL, le token vient du service d'auth : seule --staff s'applique.`);
  process.exit(1);
}

const token = usesAuthService()
  ? await demoToken(values.staff ? 'staff' : 'client')
  : await signDevToken(
      {
        tenantId: values['new-tenant'] ? randomUUID() : values.tenant,
        userId: values.user,
        ...(!values['no-email'] && { email: values.email }),
        ...(values.staff && { roles: ['staff'] }),
      },
      values.expires,
    );

// Le token seul sur stdout, pour `$(pnpm -s dev:token)` ; le reste sur stderr.
process.stdout.write(`${token}\n`);
if (process.stdout.isTTY) {
  process.stderr.write(`\nSwagger: Authorize → collez le token ci-dessus.\n`);
}
