import { randomBytes } from 'node:crypto';
import { type INestApplication, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { renderApiReference } from '@scalar/client-side-rendering';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppConfig } from '../config/app-config';
import { requestIdMiddleware } from './request-id';

/** Configuration HTTP partagée par main.ts et les tests e2e, pour tester exactement ce qui tourne en prod. */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfig);

  app.useLogger(app.get(Logger));
  // Sans ça, derrière un load balancer, tous les clients anonymes partagent l'IP du proxy.
  app.getHttpAdapter().getInstance().set('trust proxy', config.get('TRUST_PROXY_HOPS'));
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.enableCors({
    origin: config.get('CORS_ORIGINS'),
    credentials: true,
    // En-têtes de réponse que le front doit pouvoir lire.
    exposedHeaders: ['ETag', 'Idempotent-Replayed', 'X-Request-Id'],
  });
  app.setGlobalPrefix('api', { exclude: ['health', 'ready'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  if (config.get('NODE_ENV') !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('API').setVersion('1').addBearerAuth().build(),
    );
    // Document OpenAPI seul sur /api/docs-json ; la page de doc est celle de Scalar.
    SwaggerModule.setup('api/docs', app, cleanupOpenApiDoc(document), { swaggerUiEnabled: false });
    app.use('/api/docs', apiDocsPage);
  }
}

// Version épinglée : sans elle, jsdelivr sert la dernière publiée.
const SCALAR_BUNDLE = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.75.0';

/**
 * Page Scalar (dev uniquement). Son script vient de jsdelivr : la CSP de helmet, qui n'autorise que
 * 'self', est remplacée sur cette seule page par une CSP qui autorise ce script et celui, inline, de
 * configuration (par nonce).
 */
function apiDocsPage(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET' || (req.path !== '/' && req.path !== '')) return next();
  const nonce = randomBytes(16).toString('base64');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `script-src 'nonce-${nonce}' ${SCALAR_BUNDLE}`,
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data: https://fonts.scalar.com",
      "img-src 'self' data:",
      "connect-src 'self'",
    ].join('; '),
  );
  res.type('html').send(
    renderApiReference({
      config: {
        url: '/api/docs-json',
        authentication: { preferredSecurityScheme: 'bearer' },
        // Le token collé survit au rechargement de la page.
        persistAuth: true,
        // Ni services en ligne de Scalar (IA, SDK, déploiement), ni télémétrie.
        agent: { disabled: true },
        mcp: { disabled: true },
        showDeveloperTools: 'never',
        telemetry: false,
      },
      pageTitle: 'API',
      cdn: SCALAR_BUNDLE,
      nonce,
    }),
  );
}
