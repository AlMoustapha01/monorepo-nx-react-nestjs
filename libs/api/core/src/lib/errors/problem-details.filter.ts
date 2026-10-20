import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';
import { AppError, type ErrorKind } from './app-error';

/** Corps de réponse RFC 9457 (application/problem+json), enrichi d'un `code` stable. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  instance?: string;
  errors?: { path: string; message: string }[];
  details?: Readonly<Record<string, unknown>>;
}

const STATUS_BY_KIND: Record<ErrorKind, HttpStatus> = {
  VALIDATION: HttpStatus.BAD_REQUEST,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  BUSINESS_RULE: HttpStatus.UNPROCESSABLE_ENTITY,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
};

const INTERNAL_DETAIL = 'An unexpected error occurred.';

/** Seul endroit où une erreur devient une réponse HTTP. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const problem = toProblem(exception);

    if (problem.status >= 500) {
      this.logger.error(exception);
    }

    response
      .status(problem.status)
      .type('application/problem+json')
      .json({ ...problem, instance: request.originalUrl });
  }
}

export function toProblem(exception: unknown): ProblemDetails {
  if (exception instanceof AppError) {
    const status = STATUS_BY_KIND[exception.kind];
    const isInternal = status >= 500;
    return {
      ...base(status, exception.code),
      detail: isInternal ? INTERNAL_DETAIL : exception.message,
      ...(!isInternal && exception.details && { details: exception.details }),
    };
  }

  if (exception instanceof ZodValidationException) {
    const error = exception.getZodError();
    return {
      ...base(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED'),
      detail: 'The request is invalid.',
      errors:
        error instanceof z.ZodError
          ? error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            }))
          : [],
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return {
      ...base(status, HttpStatus[status] ?? 'HTTP_ERROR'),
      detail: status >= 500 ? INTERNAL_DETAIL : exception.message,
    };
  }

  return { ...base(HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR'), detail: INTERNAL_DETAIL };
}

function base(status: number, code: string) {
  return {
    type: `urn:problem-type:${code.toLowerCase().replaceAll('_', '-')}`,
    title: HttpStatus[status]?.replaceAll('_', ' ').toLowerCase() ?? 'error',
    status,
    code,
  };
}
