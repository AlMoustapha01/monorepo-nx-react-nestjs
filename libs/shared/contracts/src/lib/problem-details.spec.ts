import { problemDetailsSchema } from './problem-details';

describe('problemDetailsSchema', () => {
  it('accepts a body produced by toProblem', () => {
    const body = {
      type: 'urn:problem-type:not-found',
      title: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
      detail: 'Product PRD-1 not found.',
      instance: '/api/v1/products/PRD-1',
    };
    expect(problemDetailsSchema.parse(body)).toEqual(body);
  });

  it('accepts validation errors and details', () => {
    const body = {
      type: 'urn:problem-type:validation-failed',
      title: 'Bad Request',
      status: 400,
      code: 'VALIDATION_FAILED',
      detail: 'The request is invalid.',
      errors: [{ path: 'name', message: 'Required' }],
      details: { field: 'name' },
    };
    expect(problemDetailsSchema.parse(body)).toEqual(body);
  });

  it('rejects an object without code', () => {
    const result = problemDetailsSchema.safeParse({
      type: 'x',
      title: 'Not Found',
      status: 404,
      detail: 'd',
    });
    expect(result.success).toBe(false);
  });
});
