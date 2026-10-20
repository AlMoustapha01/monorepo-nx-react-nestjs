import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppConfig, configureApp } from '@nx-react-nestjs/api-core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app/app.module';

async function bootstrap() {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);

  const port = app.get(AppConfig).get('PORT');
  await app.listen(port);
  app.get(Logger).log(`API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
