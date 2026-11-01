import { type ArgumentsHost, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';
import { AppError, CoreError } from './app-error';
import { RequestContext } from '../context/request-context';
import { ProblemDetailsFilter, toProblem } from './problem-details.filter';

class StockError extends AppError<'OUT_OF_STOCK'> {
  constructor() {
    super('OUT_OF_STOCK', 'BUSINESS_RULE', 'Not enough stock', { available: 2 });
  }
}

describe('toProblem', () => {
  it('converts a domain error according to its category', () => {
    expect(toProblem(new StockError())).toEqual({
      type: 'urn:problem-type:out-of-stock',
      title: 'Unprocessable Entity',
      status: 422,
      code: 'OUT_OF_STOCK',
      detail: 'Not enough stock',
      details: { available: 2 },
    });
  });

  it('hides the message of internal errors', () => {
    const problem = toProblem(new CoreError('TENANT_CONTEXT_MISSING', 'secret internals'));
    expect(problem.status).toBe(500);
    expect(problem.detail).not.toContain('secret');
  });

  it('lists invalid fields for a validation error', () => {
    const error = z.object({ name: z.string() }).safeParse({}).error;
    const problem = toProblem(new ZodValidationException(error));
    expect(problem).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    expect(problem.errors).toEqual([{ path: 'name', message: expect.any(String) }]);
  });

  it('keeps the status of Nest HttpExceptions', () => {
    expect(toProblem(new NotFoundException())).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('gives a Nest 401 the same code as a CoreError UNAUTHENTICATED', () => {
    expect(toProblem(new UnauthorizedException()).code).toBe(
      toProblem(new CoreError('UNAUTHENTICATED', 'Missing token')).code,
    );
  });

  it('turns any unknown error into a generic 500', () => {
    expect(toProblem(new Error('boom'))).toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
      detail: 'An unexpected error occurred.',
    });
  });
});

describe('ProblemDetailsFilter', () => {
  it('records the error code for the request log line', () => {
    const locals = {};
    const response = { locals, status: () => response, type: () => response, json: () => response };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: '/api/v1/stock' }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    new ProblemDetailsFilter({} as RequestContext).catch(new StockError(), host);

    expect(locals).toEqual({ problemCode: 'OUT_OF_STOCK' });
  });
});
