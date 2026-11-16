import { graphileLogger, type LogTarget } from './graphile-logger';

describe('graphileLogger', () => {
  const recorded: { level: string; meta: object; message: string }[] = [];
  const target: LogTarget = {
    error: (meta, message) => recorded.push({ level: 'error', meta, message }),
    warn: (meta, message) => recorded.push({ level: 'warn', meta, message }),
    log: (meta, message) => recorded.push({ level: 'log', meta, message }),
    debug: (meta, message) => recorded.push({ level: 'debug', meta, message }),
  };
  const job = {
    id: '42',
    task_identifier: 'integration-event',
    attempts: 2,
    max_attempts: 10,
    payload: { handler: 'h', event: { payload: { customerEmail: 'alice@example.com' } } },
  };

  beforeEach(() => recorded.splice(0));

  it('never logs the payload of a job, which may carry personal data', () => {
    const logger = graphileLogger(target);
    const error = new Error('smtp down');

    logger.error('Failed task 42', { failure: true, job, error, duration: 12 });
    logger.info('Completed task 42', { job, duration: 3, success: true });

    expect(JSON.stringify(recorded)).not.toContain('alice@example.com');
    expect(recorded).toEqual([
      {
        level: 'error',
        message: 'Failed task 42',
        meta: {
          jobId: '42',
          task: 'integration-event',
          attempt: 2,
          maxAttempts: 10,
          err: error,
          duration: 12,
        },
      },
      {
        level: 'log',
        message: 'Completed task 42',
        meta: { jobId: '42', task: 'integration-event', attempt: 2, maxAttempts: 10, duration: 3 },
      },
    ]);
  });

  it('maps the levels of Graphile to those of Nest', () => {
    const logger = graphileLogger(target);
    logger.warn('w');
    logger.debug('d');
    expect(recorded.map(({ level, meta }) => ({ level, meta }))).toEqual([
      { level: 'warn', meta: {} },
      { level: 'debug', meta: {} },
    ]);
  });
});
