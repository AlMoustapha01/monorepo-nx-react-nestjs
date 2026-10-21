import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { AuthGuard } from './auth/auth.guard';
import { JwtVerifier } from './auth/jwt-verifier';
import { RolesGuard } from './auth/roles.guard';
import { AppConfig, AppConfigModule } from './config/app-config';
import { RequestContext } from './context/request-context';
import { DatabaseModule } from './database/database.module';
import { MessagingModule } from './events/messaging.module';
import { ProblemDetailsFilter } from './errors/problem-details.filter';
import { ConfiguredFeatureFlags, FeatureFlags } from './feature-flags/feature-flags';
import { FeatureFlagsController } from './feature-flags/feature-flags.controller';
import { FeatureFlagsGuard } from './feature-flags/feature-flags.guard';
import {
  DatabaseHealthIndicator,
  HealthController,
  RedisHealthIndicator,
} from './health/health.controller';
import { ShutdownState } from './lifecycle/graceful-shutdown';
import { getRequestId } from './http/request-id';

const UNLOGGED_PATHS = new Set(['/health', '/ready']);

@Global()
@Module({
  imports: [
    AppConfigModule,
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req: Request) => getRequestId(req),
      },
    }),
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        assignResponse: true,
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          genReqId: (req) => getRequestId(req),
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          autoLogging: { ignore: (req) => UNLOGGED_PATHS.has(req.url ?? '') },
          // Le filtre ne journalise que les 5xx : les 4xx restent visibles ici, en warn.
          customLogLevel: (_req, res, error) =>
            error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
          ...(config.get('NODE_ENV') === 'development' && {
            transport: { target: 'pino-pretty', options: { singleLine: true } },
          }),
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ ttl: config.get('RATE_LIMIT_TTL_MS'), limit: config.get('RATE_LIMIT_MAX') }],
      }),
    }),
    TerminusModule,
    DatabaseModule,
    MessagingModule,
  ],
  controllers: [HealthController, FeatureFlagsController],
  providers: [
    RequestContext,
    JwtVerifier,
    DatabaseHealthIndicator,
    RedisHealthIndicator,
    ShutdownState,
    { provide: FeatureFlags, useClass: ConfiguredFeatureFlags },
    // L'ordre compte : rate limiting, authentification, flag (404 avant tout 403), puis rôles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: FeatureFlagsGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
  ],
  exports: [RequestContext, FeatureFlags],
})
export class CoreModule {}
