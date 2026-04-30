type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null;
  /**
   * Called when a request returns 401 with a non-/auth/refresh path. If it
   * returns true, the original request is retried once with the (now
   * refreshed) access token. If false, the 401 is surfaced as ApiClientError.
   */
  refreshSession?: () => Promise<boolean>;
  onUnauthorized?: () => void;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Typed error for backend failures. Components and stores should switch on
 * `status` (and `isRateLimited`) rather than parsing the message, which is a
 * pre-translated user-facing string.
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const RATE_LIMIT_STATUS = 429;
const TRANSIENT_GET_STATUS = new Set([408, 500, 502, 503, 504]);

/**
 * Thin HTTP client for the backend API.
 *
 * Behaviour summary:
 * - Sends credentials (cookies) and a bearer access token if available.
 * - Single-flight `/auth/refresh`: many concurrent 401s coalesce into one refresh attempt.
 * - On 401 + successful refresh, the original request is replayed once.
 * - GET responses are deduplicated while in-flight to avoid duplicate fetches when
 *   multiple components mount at the same time.
 * - Retries: 429 on any method (honours `Retry-After`), 408/5xx only on GET, with
 *   exponential backoff and jitter.
 * - Errors surface as `ApiClientError` with the original status code preserved.
 */
export class ApiClient {
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly inflight = new Map<string, Promise<unknown>>();
  // Single-flight refresh: many concurrent 401s only trigger one /auth/refresh.
  private refreshing: Promise<boolean> | null = null;

  constructor(private readonly options: ApiClientOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  private tryRefresh(): Promise<boolean> {
    if (!this.options.refreshSession) {
      return Promise.resolve(false);
    }
    if (this.refreshing) {
      return this.refreshing;
    }
    this.refreshing = this.options.refreshSession().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async request(
    path: string,
    method: HttpMethod,
    body?: unknown,
    extraHeaders?: HeadersInit,
  ): Promise<Response> {
    const token = this.options.getAccessToken?.();
    const attemptFetch = async (): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        return await fetch(`${this.options.baseUrl}${path}`, {
          body: body ? JSON.stringify(body) : undefined,
          credentials: 'include',
          headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...extraHeaders,
          },
          method,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    const isGet = method === 'GET';
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await attemptFetch();

        // Rate-limit: retry on any method, honoring Retry-After if present.
        if (response.status === RATE_LIMIT_STATUS && attempt < this.maxRetries) {
          await sleep(parseRetryAfterMs(response) ?? backoffMs(attempt));
          continue;
        }

        // Transient 5xx / 408: only safe to retry on GET.
        if (isGet && TRANSIENT_GET_STATUS.has(response.status) && attempt < this.maxRetries) {
          await sleep(backoffMs(attempt));
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;
        if (!isGet || attempt === this.maxRetries) {
          throw error;
        }
        await sleep(backoffMs(attempt));
      }
    }

    throw lastError ?? new Error('API request failed');
  }

  private async requestJson<T>(
    path: string,
    method: HttpMethod,
    body?: unknown,
    extraHeaders?: HeadersInit,
  ): Promise<T> {
    let response = await this.request(path, method, body, extraHeaders);

    // 401 with auto-refresh: try a single refresh and replay the request once
    // before surfacing the error. Skip when the failing call IS the refresh
    // endpoint itself (otherwise infinite loops) or when no refresher is set.
    if (
      response.status === 401 &&
      !path.startsWith('/auth/refresh') &&
      this.options.refreshSession
    ) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        response = await this.request(path, method, body, extraHeaders);
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        this.options.onUnauthorized?.();
      }

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      const message = normalizeErrorMessage(payload) ?? defaultMessageForStatus(response.status);
      throw new ApiClientError(message, response.status, parseRetryAfterMs(response));
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  get<T>(path: string, extraHeaders?: HeadersInit) {
    const key = `GET ${path}`;
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) {
      return existing;
    }

    const promise = this.requestJson<T>(path, 'GET', undefined, extraHeaders).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }

  post<T>(path: string, body?: unknown, extraHeaders?: HeadersInit) {
    return this.requestJson<T>(path, 'POST', body, extraHeaders);
  }

  put<T>(path: string, body?: unknown, extraHeaders?: HeadersInit) {
    return this.requestJson<T>(path, 'PUT', body, extraHeaders);
  }

  patch<T>(path: string, body?: unknown, extraHeaders?: HeadersInit) {
    return this.requestJson<T>(path, 'PATCH', body, extraHeaders);
  }

  delete<T>(path: string, extraHeaders?: HeadersInit) {
    return this.requestJson<T>(path, 'DELETE', undefined, extraHeaders);
  }

  async getBlob(path: string) {
    const response = await this.request(path, 'GET');

    if (!response.ok) {
      if (response.status === 401) {
        this.options.onUnauthorized?.();
      }

      throw new ApiClientError(
        defaultMessageForStatus(response.status),
        response.status,
        parseRetryAfterMs(response),
      );
    }

    return response.blob();
  }
}

function backoffMs(attempt: number): number {
  const base = 300;
  const jitter = Math.floor(Math.random() * 150);
  return base * 2 ** attempt + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseRetryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) {
    return undefined;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return undefined;
}

// Backend may return `message` as a string, an array (NestJS validation errors)
// or an object. Coerce it into a single human-readable string.
function normalizeErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const raw = (payload as { message?: unknown }).message;
  if (typeof raw === 'string' && raw.trim()) {
    return raw;
  }
  if (Array.isArray(raw)) {
    const parts = raw
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
      .filter(Boolean);
    return parts.length ? parts.join('. ') : undefined;
  }
  if (raw && typeof raw === 'object') {
    try {
      return JSON.stringify(raw);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function defaultMessageForStatus(status: number): string {
  switch (status) {
    case 401: {
      return 'Sesión expirada. Vuelve a iniciar sesión.';
    }
    case 403: {
      return 'No tienes permisos para realizar esta acción.';
    }
    case 404: {
      return 'Recurso no encontrado.';
    }
    case 408: {
      return 'La petición ha tardado demasiado. Inténtalo de nuevo.';
    }
    case 429: {
      return 'Demasiadas solicitudes. Espera unos segundos y vuelve a intentarlo.';
    }
    case 500:
    case 502:
    case 503:
    case 504: {
      return 'Error temporal del servidor. Inténtalo de nuevo en un momento.';
    }
    default: {
      return `Error ${status}`;
    }
  }
}
