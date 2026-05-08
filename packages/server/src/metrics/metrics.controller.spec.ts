import { NotFoundException, UnauthorizedException } from '@nestjs/common';

import { MetricsController } from './metrics.controller';

describe('MetricsController', () => {
  const metricsService = {
    contentType: jest.fn().mockReturnValue('text/plain; version=0.0.4'),
    metrics: jest.fn().mockResolvedValue('metric_name 1\n'),
  };
  const getDefaultConfigValue = (key: string) => {
    const values: Record<string, unknown> = {
      METRICS_TOKEN: 'token-1234567890',
      NODE_ENV: 'production',
    };
    return values[key];
  };
  const configService = {
    get: jest.fn(getDefaultConfigValue),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockImplementation(getDefaultConfigValue);
  });

  it('sends metrics with the Prometheus content type when authorized', async () => {
    const controller = new MetricsController(metricsService as never, configService as never);
    const response = {
      send: jest.fn(),
      setHeader: jest.fn(),
    };

    await controller.metrics(
      { headers: { authorization: 'Bearer token-1234567890' } } as never,
      response as never,
    );

    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain; version=0.0.4');
    expect(response.send).toHaveBeenCalledWith('metric_name 1\n');
  });

  it('hides metrics with 404 when no token is configured in production', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'NODE_ENV' ? 'production' : undefined,
    );
    const controller = new MetricsController(metricsService as never, configService as never);

    await expect(controller.metrics({ headers: {} } as never, {} as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects requests without a valid metrics token', async () => {
    const controller = new MetricsController(metricsService as never, configService as never);

    await expect(controller.metrics({ headers: {} } as never, {} as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
