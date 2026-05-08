type NitroEvent = {
  req: Request;
  url?: URL;
};

const DEFAULT_API_TARGET = 'http://localhost:4000';
const HOP_BY_HOP_HEADERS = [
  'connection',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

function cleanEnvUrl(value: string | undefined, fallback: string): string {
  const cleaned = (value ?? fallback).trim().replace(/^['"]|['"]$/g, '');
  return cleaned.endsWith('/') ? cleaned.slice(0, -1) : cleaned;
}

function proxyTargetUrl(requestUrl: URL): URL {
  const targetBase = cleanEnvUrl(process.env.API_PROXY_TARGET, DEFAULT_API_TARGET);
  const targetUrl = new URL(targetBase);
  targetUrl.pathname = requestUrl.pathname;
  targetUrl.search = requestUrl.search;
  return targetUrl;
}

const apiProxyHandler = async (event: NitroEvent) => {
  const requestUrl = event.url ?? new URL(event.req.url);
  const targetUrl = proxyTargetUrl(requestUrl);
  const headers = new Headers(event.req.headers);

  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }

  const init: RequestInit & { duplex?: 'half' } = {
    headers,
    method: event.req.method,
    redirect: 'manual',
  };

  if (event.req.method !== 'GET' && event.req.method !== 'HEAD') {
    init.body = event.req.body;
    init.duplex = 'half';
  }

  try {
    return await fetch(targetUrl, init);
  } catch (error) {
    console.error(
      `[api-proxy] Failed to proxy ${requestUrl.pathname} to ${targetUrl.origin}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    return new Response(
      JSON.stringify({
        error: true,
        message: 'API proxy connection failed',
        status: 502,
      }),
      {
        headers: { 'content-type': 'application/json; charset=utf-8' },
        status: 502,
      },
    );
  }
};

export default apiProxyHandler;
