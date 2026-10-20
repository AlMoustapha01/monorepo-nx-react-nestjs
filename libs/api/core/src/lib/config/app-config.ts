import { Global, Module } from '@nestjs/common';
import { type Env, validateEnv } from './env';

export class AppConfig {
  constructor(private readonly env: Env) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.env[key];
  }
}

/** La validation a lieu à la création du conteneur DI, pas à l'import du module. */
@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: () => new AppConfig(validateEnv(process.env)) }],
  exports: [AppConfig],
})
export class AppConfigModule {}
