import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | null = null;

export interface TracingOptions {
  serviceName: string;
  serviceVersion?: string;
}

/**
 * Boot OpenTelemetry tracing if `OTEL_ENABLED=true`. Must be called BEFORE any
 * Nest / express / pg / ioredis / bullmq import so auto-instrumentations can
 * patch them. The function is a no-op when disabled or when the OTLP endpoint
 * is missing — calling it is always safe.
 */
export function startTracing(options: TracingOptions): void {
  if (sdk) {
    return;
  }
  if (process.env.OTEL_ENABLED !== 'true') {
    return;
  }

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    // eslint-disable-next-line no-console -- bootstrap, before logger exists
    console.warn(
      '[otel] OTEL_ENABLED=true but OTEL_EXPORTER_OTLP_ENDPOINT is not set — tracing not started.',
    );
    return;
  }

  if (process.env.OTEL_LOG_LEVEL === 'debug') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const serviceName = process.env.OTEL_SERVICE_NAME ?? options.serviceName;

  sdk = new NodeSDK({
    instrumentations: [
      getNodeAutoInstrumentations({
        // Skip very-noisy and rarely-actionable instrumentations.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: options.serviceVersion ?? process.env.npm_package_version ?? '0.0.0',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
  });

  sdk.start();

  const shutdown = async () => {
    if (!sdk) {
      return;
    }
    try {
      await sdk.shutdown();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`[otel] shutdown failed: ${String(error)}`);
    }
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}
