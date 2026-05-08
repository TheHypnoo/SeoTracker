import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';

import { AllExceptionsFilter } from './all-exceptions.filter';

function makeHost(opts: { url?: string; requestId?: string; method?: string }) {
  const req = {
    url: opts.url ?? '/api/v1/x',
    method: opts.method ?? 'GET',
    headers: {},
    requestId: opts.requestId,
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return {
    host: {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ArgumentsHost,
    res,
  };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  it('uses the HttpException status + getResponse() body', () => {
    const { host, res } = makeHost({ requestId: 'req-1' });

    filter.catch(new BadRequestException({ message: 'bad' }), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, requestId: 'req-1' }),
    );
  });

  it('unwraps standard HttpException response messages', () => {
    const { host, res } = makeHost({});

    filter.catch(
      new HttpException(
        {
          error: 'Too Many Requests',
          message: 'Too many requests. Please slow down.',
          statusCode: 429,
        },
        429,
      ),
      host,
    );

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Too many requests. Please slow down.',
        statusCode: 429,
      }),
    );
  });

  it('coerces unknown errors to 500 with the Error message', () => {
    process.env.NODE_ENV = 'development';
    const { host, res } = makeHost({});

    filter.catch(new Error('mystery'), host);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, message: 'mystery' }),
    );
  });

  it('hides the message in production for 500s (only generic "Internal server error")', () => {
    process.env.NODE_ENV = 'production';
    const { host, res } = makeHost({});

    filter.catch(new Error('leaky internal detail'), host);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Internal server error' }),
    );
  });

  it('preserves HttpException 4xx messages even in production', () => {
    process.env.NODE_ENV = 'production';
    const { host, res } = makeHost({});

    filter.catch(new HttpException('email taken', 409), host);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: 'email taken' }),
    );
  });
});
