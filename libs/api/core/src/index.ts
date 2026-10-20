export { CoreModule } from './lib/core.module';
export { AppConfig } from './lib/config/app-config';
export type { Env } from './lib/config/env';
export { AppError, CoreError, type CoreErrorCode, type ErrorKind } from './lib/errors/app-error';
export type { ProblemDetails } from './lib/errors/problem-details.filter';
export { RequestContext, type Principal } from './lib/context/request-context';
export { Public } from './lib/auth/public.decorator';
export { type Database, InjectDatabase } from './lib/database/database.tokens';
export { DatabaseSession, TransactionManager } from './lib/database/database-session';
export { isUniqueViolation } from './lib/database/pg-errors';
export { PersistenceMapper } from './lib/database/persistence-mapper';
export {
  type IntegrationEvent,
  type IntegrationEventHandler,
  OnIntegrationEvent,
} from './lib/events/integration-event';
export { Outbox } from './lib/events/outbox';
export { domainIdGenerator } from './lib/ids/domain-id';
export { type KeysetCursor, decodeCursor, encodeCursor } from './lib/http/cursor';
export { configureApp } from './lib/http/configure-app';
