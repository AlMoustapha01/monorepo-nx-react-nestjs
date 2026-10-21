import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import type { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';
import { RequestContext } from '../context/request-context';
import { AppError, type ErrorKind } from './app-error';
import { reportError } from './error-reporter';

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
  PRECONDITION_FAILED: HttpStatus.PRECONDITION_FAILED,
  BUSINESS_RULE: HttpStatus.UNPROCESSABLE_ENTITY,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** Aligne les codes des HttpException de Nest sur ceux d'`AppError`, pour un seul code par situation. */
const CODE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
};

const INTERNAL_DETAIL = 'An unexpected error occurred.';

/** Seul endroit où une erreur devient une réponse HTTP. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  constructor(private readonly context: RequestContext) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const problem = toProblem(exception);

    // Une HttpException 5xx est levée exprès (ex. 503 de /ready pendant un arrêt) : pas un bug.
    if (problem.status >= 500 && !(exception instanceof HttpException)) {
      this.logger.error(exception);
      reportError(exception, {
        tags: {
          request_id: this.context.requestId,
          tenant_id: this.context.principal?.tenantId,
          // Gabarit de la route (`/api/v1/orders/:id`) : regroupe les erreurs d'un même endpoint.
          route: `${request.method} ${(request.route as { path?: string } | undefined)?.path ?? request.path}`,
        },
        userId: this.context.principal?.userId,
      });
    }

    response
      .status(problem.status)
      .type('application/problem+json')
      // Chemin seul : la query string peut porter un secret (token de lien magique…).
      .json({ ...problem, instance: request.originalUrl.split('?', 1)[0] });
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
      ...base(status, CODE_BY_STATUS[status] ?? HttpStatus[status] ?? 'HTTP_ERROR'),
      detail: status >= 500 ? INTERNAL_DETAIL : exception.message,
    };
  }

  return { ...base(HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR'), detail: INTERNAL_DETAIL };
}

function base(status: number, code: string) {
  return {
    type: `urn:problem-type:${code.toLowerCase().replaceAll('_', '-')}`,
    title: STATUS_CODES[status] ?? 'Error',
    status,
    code,
  };
}
