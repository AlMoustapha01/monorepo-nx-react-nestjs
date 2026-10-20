import { Injectable } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { z } from 'zod';
import { AppConfig } from '../config/app-config';
import type { Principal } from '../context/request-context';
import { CoreError } from '../errors/app-error';

const claimsSchema = z.object({
  sub: z.uuid(),
  tenant_id: z.uuid(),
});

@Injectable()
export class JwtVerifier {
  private readonly secret: Uint8Array;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(config: AppConfig) {
    this.secret = new TextEncoder().encode(config.get('AUTH_JWT_SECRET'));
    this.issuer = config.get('AUTH_JWT_ISSUER');
    this.audience = config.get('AUTH_JWT_AUDIENCE');
  }

  async verify(token: string): Promise<Principal> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['HS256'],
      });
      const claims = claimsSchema.parse(payload);
      return { userId: claims.sub, tenantId: claims.tenant_id };
    } catch {
      throw new CoreError('UNAUTHENTICATED', 'Invalid or expired access token');
    }
  }
}
