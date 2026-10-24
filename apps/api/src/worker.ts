// En premier : charge les .env et active OpenTelemetry avant tout autre module.
import { shutdownTelemetry } from './instrumentation';
import { NestFactory } from '@nestjs/core';
import { closeOnSignal } from '@nx-react-nestjs/api-core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app/app.module';

/** Process sans HTTP : relais de l'outbox, worker BullMQ et purge quotidienne. Se met à l'échelle à part. */
async function bootstrap() {
  // C'est le rôle de ce process, quelle que soit la valeur partagée avec l'API.
  process.env['JOBS_ENABLED'] = 'true';

  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  closeOnSignal(app, shutdownTelemetry);
  app.get(Logger).log('Worker started');
}

void bootstrap();
