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
  it('convertit une erreur de domaine selon sa catégorie', () => {
    expect(toProblem(new StockError())).toEqual({
      type: 'urn:problem-type:out-of-stock',
      title: 'Unprocessable Entity',
      status: 422,
      code: 'OUT_OF_STOCK',
      detail: 'Not enough stock',
      details: { available: 2 },
    });
  });

  it('masque le message des erreurs internes', () => {
    const problem = toProblem(new CoreError('TENANT_CONTEXT_MISSING', 'secret internals'));
    expect(problem.status).toBe(500);
    expect(problem.detail).not.toContain('secret');
  });

  it('liste les champs invalides pour une erreur de validation', () => {
    const error = z.object({ name: z.string() }).safeParse({}).error;
    const problem = toProblem(new ZodValidationException(error));
    expect(problem).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    expect(problem.errors).toEqual([{ path: 'name', message: expect.any(String) }]);
  });

  it('garde le statut des HttpException de Nest', () => {
    expect(toProblem(new NotFoundException())).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('donne le même code à un 401 de Nest qu’à un CoreError UNAUTHENTICATED', () => {
    expect(toProblem(new UnauthorizedException()).code).toBe(
      toProblem(new CoreError('UNAUTHENTICATED', 'Missing token')).code,
    );
  });

  it('transforme toute erreur inconnue en 500 générique', () => {
    expect(toProblem(new Error('boom'))).toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
      detail: 'An unexpected error occurred.',
    });
  });
});

describe('ProblemDetailsFilter', () => {
  it('note le code de l’erreur pour la ligne de log de la requête', () => {
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
