/**
 * Remplit le tenant de dev avec quelques produits, en passant par l'API (règles métier comprises).
 * Idempotent : un SKU déjà présent est ignoré. Nécessite l'API démarrée (`pnpm nx serve api`).
 * Avec le service d'auth (AUTH_JWKS_URL dans .env, `pnpm nx serve auth`) : crée aussi les comptes
 * et l'organisation de démo, qui devient le tenant.
 */
import {
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  demoToken,
  ensureDemoOrganization,
  usesAuthService,
} from './auth-service.mts';
import { apiBaseUrl, DEV_EMAIL, DEV_TENANT_ID, DEV_USER_ID, signDevToken } from './dev-env.mts';

interface SeedProduct {
  sku: string;
  name: string;
  amountMinor: number;
  publish: boolean;
}

const PRODUCTS: SeedProduct[] = [
  { sku: 'TEE-WHITE-M', name: 'Tee-shirt blanc (M)', amountMinor: 1990, publish: true },
  { sku: 'TEE-BLACK-L', name: 'Tee-shirt noir (L)', amountMinor: 2190, publish: true },
  { sku: 'MUG-LOGO', name: 'Mug logo', amountMinor: 1200, publish: true },
  { sku: 'CAP-NAVY', name: 'Casquette marine', amountMinor: 2490, publish: true },
  {
    sku: 'HOODIE-GREY',
    name: 'Sweat gris (bientôt disponible)',
    amountMinor: 4990,
    publish: false,
  },
];

const base = apiBaseUrl();
const withAuthService = usesAuthService();
const tenantId = withAuthService ? await ensureDemoOrganization() : DEV_TENANT_ID;
// Créer et publier des produits est réservé au staff.
const token = withAuthService
  ? await demoToken('staff')
  : await signDevToken({
      tenantId: DEV_TENANT_ID,
      userId: DEV_USER_ID,
      email: DEV_EMAIL,
      roles: ['staff'],
    });

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}

try {
  await fetch(`${base}/ready`, { signal: AbortSignal.timeout(2000) });
} catch {
  console.error(`API injoignable sur ${base} : lancez "pnpm nx serve api" puis relancez le seed.`);
  process.exit(1);
}

for (const product of PRODUCTS) {
  const created = await call('POST', '/api/v1/catalog/products', {
    sku: product.sku,
    name: product.name,
    price: { amountMinor: product.amountMinor, currency: 'EUR' },
  });
  if (created.status === 409) {
    console.log(`= ${product.sku} existe déjà`);
    continue;
  }
  if (!created.ok) {
    throw new Error(`${product.sku}: ${created.status} ${await created.text()}`);
  }
  const { id } = (await created.json()) as { id: string };
  if (product.publish) {
    const published = await call('POST', `/api/v1/catalog/products/${id}/publish`);
    if (!published.ok) {
      throw new Error(`${product.sku} publish: ${published.status} ${await published.text()}`);
    }
  }
  console.log(`+ ${product.sku} ${id}${product.publish ? '' : ' (brouillon)'}`);
}

console.log(
  `\nTenant de dev ${tenantId} prêt. Tokens : pnpm -s dev:token (client), --staff (gestion).`,
);
if (withAuthService) {
  console.log(
    `Comptes (mot de passe ${DEMO_PASSWORD}) : ${DEMO_ACCOUNTS.staff.email} (staff), ${DEMO_ACCOUNTS.client.email} (client).`,
  );
}
