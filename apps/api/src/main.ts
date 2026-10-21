import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppConfig, closeOnSignal, configureApp } from '@nx-react-nestjs/api-core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app/app.module';

/** Process HTTP. Relais et worker inclus tant que JOBS_ENABLED=true (dev) ; en prod, voir worker.ts. */
async function bootstrap() {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);
  closeOnSignal(app);

  const port = app.get(AppConfig).get('PORT');
  await app.listen(port);
  app.get(Logger).log(`API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
