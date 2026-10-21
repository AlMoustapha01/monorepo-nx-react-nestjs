import { Injectable, Logger } from '@nestjs/common';
import { createRemoteJWKSet, errors, type JWTPayload, type JWTVerifyGetKey, jwtVerify } from 'jose';
import { z } from 'zod';
import { AppConfig } from '../config/app-config';
import type { Principal } from '../context/request-context';
import { ROLES, type Role } from './roles';
import { CoreError } from '../errors/app-error';

/** Avec un JWKS : algorithmes asymétriques seulement. L'en-tête du token ne choisit jamais l'algorithme. */
const ASYMMETRIC_ALGORITHMS = ['EdDSA', 'ES256', 'RS256'];
const JWKS_TIMEOUT_MS = 5_000;

const claimsSchema = z.object({
  sub: z.uuid(),
  tenantId: z.uuid(),
  email: z.email().optional(),
  roles: z.array(z.string()).default([]),
});

/** Les rôles inconnus de l'application sont ignorés, jamais interprétés. */
const isKnownRole = (role: string): role is Role => (ROLES as readonly string[]).includes(role);

/** Nom exact d'abord (claims préfixées par une URL, qui contiennent des points), puis chemin pointé. */
function claimAt(payload: JWTPayload, path: string): unknown {
  if (path in payload) {
    return payload[path];
  }
  return path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value !== null && typeof value === 'object'
          ? (value as Record<string, unknown>)[key]
          : undefined,
      payload,
    );
}

const unauthenticated = () => new CoreError('UNAUTHENTICATED', 'Invalid or expired access token');

/**
 * Vérifie les access tokens. En production, avec les clés publiques du fournisseur d'identité
 * (`AUTH_JWKS_URL`) ; en dev et en test, avec un secret HS256 (`AUTH_JWT_SECRET`).
 */
@Injectable()
export class JwtVerifier {
  private readonly logger = new Logger(JwtVerifier.name);
  private readonly key: JWTVerifyGetKey;
  private readonly algorithms: string[];
  private readonly issuer: string;
  private readonly audience: string;
  private readonly tenantClaim: string;
  private readonly rolesClaim: string;

  constructor(config: AppConfig) {
    const jwksUrl = config.get('AUTH_JWKS_URL');
    if (jwksUrl) {
      // Clés en cache ; un `kid` inconnu (rotation) relance le téléchargement, au plus toutes les 30 s.
      this.key = createRemoteJWKSet(new URL(jwksUrl), { timeoutDuration: JWKS_TIMEOUT_MS });
      this.algorithms = ASYMMETRIC_ALGORITHMS;
    } else {
      const secret = new TextEncoder().encode(config.get('AUTH_JWT_SECRET'));
      this.key = () => secret;
      this.algorithms = ['HS256'];
    }
    this.issuer = config.get('AUTH_JWT_ISSUER');
    this.audience = config.get('AUTH_JWT_AUDIENCE');
    this.tenantClaim = config.get('AUTH_TENANT_CLAIM');
    this.rolesClaim = config.get('AUTH_ROLES_CLAIM');
  }

  async verify(token: string): Promise<Principal> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.key, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: this.algorithms,
      }));
    } catch (error) {
      // Fournisseur injoignable ou JWKS invalide : ce n'est pas la faute du client, on le signale.
      if (!(error instanceof errors.JOSEError) || error instanceof errors.JWKSTimeout) {
        this.logger.warn({ err: error }, 'Identity provider keys unavailable');
      }
      throw unauthenticated();
    }

    const claims = claimsSchema.safeParse({
      sub: payload.sub,
      tenantId: claimAt(payload, this.tenantClaim),
      email: payload['email'],
      roles: claimAt(payload, this.rolesClaim),
    });
    if (!claims.success) {
      throw unauthenticated();
    }
    const { sub, tenantId, email, roles } = claims.data;
    return { userId: sub, tenantId, ...(email && { email }), roles: roles.filter(isKnownRole) };
  }
}
