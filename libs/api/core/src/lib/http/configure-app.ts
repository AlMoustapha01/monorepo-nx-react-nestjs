import { type INestApplication, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppConfig } from '../config/app-config';
import { requestIdMiddleware } from './request-id';

/** Configuration HTTP partagée par main.ts et les tests e2e, pour tester exactement ce qui tourne en prod. */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfig);

  app.useLogger(app.get(Logger));
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.enableCors({ origin: config.get('CORS_ORIGINS'), credentials: true });
  app.setGlobalPrefix('api', { exclude: ['health', 'ready'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();

  if (config.get('NODE_ENV') !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('API').setVersion('1').addBearerAuth().build(),
    );
    SwaggerModule.setup('api/docs', app, cleanupOpenApiDoc(document));
  }
}
