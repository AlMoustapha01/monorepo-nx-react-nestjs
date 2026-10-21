import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfig } from '../../config/app-config';
import { RequestContext } from '../../context/request-context';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Module({
  providers: [RedisThrottlerStorage, RequestContext],
  exports: [RedisThrottlerStorage, RequestContext],
})
class RateLimitStorageModule {}

/**
 * `RATE_LIMIT_MAX` requêtes par `RATE_LIMIT_TTL_MS`, comptées dans Redis. Le guard passe après
 * l'authentification : un utilisateur a son propre compteur (des collègues derrière la même IP
 * ne se gênent pas) ; une route publique compte par IP (`TRUST_PROXY_HOPS` derrière un proxy).
 */
export const RateLimitModule = ThrottlerModule.forRootAsync({
  imports: [RateLimitStorageModule],
  inject: [AppConfig, RedisThrottlerStorage, RequestContext],
  useFactory: (config: AppConfig, storage: RedisThrottlerStorage, context: RequestContext) => ({
    throttlers: [{ ttl: config.get('RATE_LIMIT_TTL_MS'), limit: config.get('RATE_LIMIT_MAX') }],
    storage,
    // Requête Express : `ip` tient compte de `trust proxy`.
    getTracker: (request: Record<string, unknown>) => {
      const principal = context.principal;
      return principal ? `user:${principal.userId}` : `ip:${String(request['ip'])}`;
    },
  }),
});
