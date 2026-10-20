import { existsSync } from 'node:fs';
import { SignJWT } from 'jose';

/** Identités de dev fixes : le seed et les tokens générés tombent dans le même tenant. */
export const DEV_TENANT_ID = '00000000-0000-4000-8000-000000000001';
export const DEV_USER_ID = '00000000-0000-4000-8000-000000000002';
export const DEV_EMAIL = 'dev@shop.local';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Script de dev : un message actionnable plutôt qu'une stack trace.
    console.error(`${name} manquant : lancez "pnpm dev:setup" (crée .env depuis .env.example).`);
    process.exit(1);
  }
  return value;
}

export interface DevPrincipal {
  tenantId: string;
  userId: string;
  email?: string;
}

/** Même format que le fournisseur d'identité : HS256, claims `sub`, `tenant_id`, `email`. */
export function signDevToken(principal: DevPrincipal, expiresIn = '12h'): Promise<string> {
  return new SignJWT({ tenant_id: principal.tenantId, email: principal.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(principal.userId)
    .setIssuer(env('AUTH_JWT_ISSUER'))
    .setAudience(env('AUTH_JWT_AUDIENCE'))
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(env('AUTH_JWT_SECRET')));
}

export function apiBaseUrl(): string {
  return `http://localhost:${process.env['PORT'] ?? '3000'}`;
}
