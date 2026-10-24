import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerGuard } from '@nestjs/throttler';
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
import { Mailer, mailerProvider } from './mail/mailer';
import { RateLimitModule } from './http/rate-limit/rate-limit.module';
import { getRequestId } from './http/request-id';
import { requestLoggingOptions } from './http/request-logging';

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
          ...requestLoggingOptions(config.get('LOG_LEVEL')),
          level: config.get('LOG_LEVEL'),
          genReqId: (req) => getRequestId(req),
          autoLogging: { ignore: (req) => UNLOGGED_PATHS.has(req.url ?? '') },
          ...(config.get('NODE_ENV') === 'development' && {
            transport: {
              target: 'pino-pretty',
              // Le message résume déjà la requête : on n'y ajoute que la durée et le request id.
              options: {
                singleLine: true,
                ignore: 'pid,hostname,req,res,responseTime,code',
                messageFormat: '{msg}{if responseTime} ({responseTime} ms) [{req.id}]{end}',
              },
            },
          }),
        },
      }),
    }),
    RateLimitModule,
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
    mailerProvider,
    // L'ordre compte : authentification, rate limiting (par utilisateur), flag (404 avant tout
    // 403), puis rôles.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: FeatureFlagsGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
  ],
  exports: [RequestContext, FeatureFlags, Mailer],
})
export class CoreModule {}
