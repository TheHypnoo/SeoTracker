import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
type LoadedTracing = {
  startTracing: (options: { serviceName: string; serviceVersion?: string }) => void;
  mocks: {
    diagSetLogger: jest.Mock;
    getNodeAutoInstrumentations: jest.Mock;
    nodeSdkCtor: jest.Mock;
    otlpCtor: jest.Mock;
    resourceFromAttributes: jest.Mock;
    shutdown: jest.Mock;
    start: jest.Mock;
  };
};

async function loadTracing(): Promise<LoadedTracing> {
  jest.resetModules();

  const start = jest.fn();
  const shutdown = jest.fn().mockResolvedValue(undefined);
  const diagSetLogger = jest.fn();
  const getNodeAutoInstrumentations = jest.fn().mockReturnValue(['auto-instrumentations']);
  const otlpCtor = jest.fn().mockImplementation((options: unknown) => ({ options }));
  const resourceFromAttributes = jest.fn().mockImplementation((attributes: unknown) => attributes);
  const nodeSdkCtor = jest.fn().mockImplementation((options: unknown) => ({
    options,
    shutdown,
    start,
  }));

  jest.doMock('@opentelemetry/api', () => ({
    diag: { setLogger: diagSetLogger },
    DiagConsoleLogger: jest.fn(),
    DiagLogLevel: { DEBUG: 'DEBUG' },
  }));
  jest.doMock('@opentelemetry/auto-instrumentations-node', () => ({
    getNodeAutoInstrumentations,
  }));
  jest.doMock('@opentelemetry/exporter-trace-otlp-http', () => ({
    OTLPTraceExporter: otlpCtor,
  }));
  jest.doMock('@opentelemetry/resources', () => ({
    resourceFromAttributes,
  }));
  jest.doMock('@opentelemetry/sdk-node', () => ({
    NodeSDK: nodeSdkCtor,
  }));
  jest.doMock('@opentelemetry/semantic-conventions', () => ({
    ATTR_SERVICE_NAME: 'service.name',
    ATTR_SERVICE_VERSION: 'service.version',
  }));

  let tracing: typeof import('./tracing') | undefined;
  jest.isolateModules(() => {
    tracing = jest.requireActual('./tracing') as typeof import('./tracing');
  });
  if (!tracing) {
    throw new Error('Tracing module could not be loaded');
  }
  return {
    startTracing: tracing.startTracing,
    mocks: {
      diagSetLogger,
      getNodeAutoInstrumentations,
      nodeSdkCtor,
      otlpCtor,
      resourceFromAttributes,
      shutdown,
      start,
    },
  };
}

describe('startTracing', () => {
  const originalEnv = process.env;
  let onceSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv };
    onceSpy = jest.spyOn(process, 'once').mockReturnValue(process);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    onceSpy.mockRestore();
    warnSpy.mockRestore();
    jest.dontMock('@opentelemetry/api');
    jest.dontMock('@opentelemetry/auto-instrumentations-node');
    jest.dontMock('@opentelemetry/exporter-trace-otlp-http');
    jest.dontMock('@opentelemetry/resources');
    jest.dontMock('@opentelemetry/sdk-node');
    jest.dontMock('@opentelemetry/semantic-conventions');
  });

  it('does nothing when tracing is disabled', async () => {
    process.env.OTEL_ENABLED = 'false';
    const { startTracing, mocks } = await loadTracing();

    startTracing({ serviceName: 'api' });

    expect(mocks.nodeSdkCtor).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('warns and does not start when endpoint is missing', async () => {
    process.env.OTEL_ENABLED = 'true';
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { startTracing, mocks } = await loadTracing();

    startTracing({ serviceName: 'api' });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('OTEL_EXPORTER_OTLP_ENDPOINT'));
    expect(mocks.nodeSdkCtor).not.toHaveBeenCalled();
  });

  it('starts the Node SDK once with resource, exporter and auto-instrumentation config', async () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otel.example.test/';
    process.env.OTEL_LOG_LEVEL = 'debug';
    process.env.OTEL_SERVICE_NAME = 'api-env';
    const { startTracing, mocks } = await loadTracing();

    startTracing({ serviceName: 'api', serviceVersion: '1.2.3' });
    startTracing({ serviceName: 'api', serviceVersion: '1.2.3' });

    expect(mocks.diagSetLogger).toHaveBeenCalledWith(expect.anything(), 'DEBUG');
    expect(mocks.getNodeAutoInstrumentations).toHaveBeenCalledWith({
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-fs': { enabled: false },
    });
    expect(mocks.resourceFromAttributes).toHaveBeenCalledWith({
      'service.name': 'api-env',
      'service.version': '1.2.3',
    });
    expect(mocks.otlpCtor).toHaveBeenCalledWith({
      url: 'https://otel.example.test/v1/traces',
    });
    expect(mocks.nodeSdkCtor).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(onceSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(onceSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
  });

  it('logs shutdown failures from registered signal handlers', async () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otel.example.test';
    const { startTracing, mocks } = await loadTracing();
    mocks.shutdown.mockRejectedValueOnce(new Error('flush failed'));

    startTracing({ serviceName: 'api' });
    const sigtermHandler = onceSpy.mock.calls.find(([event]) => event === 'SIGTERM')?.[1] as
      | (() => void)
      | undefined;
    sigtermHandler?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('shutdown failed'));
  });
});
