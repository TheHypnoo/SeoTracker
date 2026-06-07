import {
  ResponseTooLargeError,
  safeFetch,
  type SafeFetchOptions,
  SsrfBlockedError,
} from '../common/utils/safe-fetch';

// Bounded retry policy shared by every outbound audit fetch (homepage, robots,
// sitemaps, crawled pages). Transient failures — timeouts, connection resets,
// 408/429/5xx — are retried a small number of times so a single hiccup does not
// turn into a DOMAIN_UNREACHABLE / MISSING_* false positive. SSRF blocks and
// oversized responses are never retried: they are deterministic refusals.
const FETCH_RETRY_ATTEMPTS = clampInt(Number(process.env.AUDIT_FETCH_RETRY_ATTEMPTS) || 2, 1, 3);
const FETCH_RETRY_BASE_DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 150;

export type RetryableFetchOptions = Omit<SafeFetchOptions, 'signal'>;

/** Normalises an outbound-fetch failure into a short, stable reason string. */
export function classifyFetchError(error: unknown): string {
  if (error instanceof ResponseTooLargeError) return 'response_too_large';
  if (error instanceof SsrfBlockedError) return 'blocked_by_ssrf_guard';
  if (typeof error === 'object' && error !== null) {
    const name = String((error as { name?: unknown }).name ?? '');
    const message = String((error as { message?: unknown }).message ?? '');
    if (name === 'TimeoutError' || name === 'AbortError' || /timeout|aborted/i.test(message)) {
      return 'timeout';
    }
  }
  if (error instanceof Error) {
    return error.name || 'error';
  }
  return 'error';
}

export function isRetriableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status !== 501);
}

export function isRetriableFetchError(error: unknown): boolean {
  if (error instanceof ResponseTooLargeError || error instanceof SsrfBlockedError) return false;
  if (classifyFetchError(error) === 'timeout') return true;
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    return /econnreset|econnrefused|enotfound|terminated|fetch failed|network/i.test(
      `${error.name} ${error.message}`,
    );
  }
  return false;
}

/**
 * `safeFetch` with a bounded retry on transient failures. A fresh timeout
 * signal is created per attempt. The caller passes everything except `signal`.
 */
export async function safeFetchWithRetry(
  url: string,
  init: RetryableFetchOptions,
  timeoutMs: number,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= FETCH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await safeFetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (isRetriableStatus(response.status) && attempt < FETCH_RETRY_ATTEMPTS) {
        await cancelResponseBody(response);
        await waitBeforeRetry(attempt);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (!isRetriableFetchError(error) || attempt >= FETCH_RETRY_ATTEMPTS) {
        throw error;
      }
      await waitBeforeRetry(attempt);
    }
  }
  // Defensive fallback: the loop above always returns (success / non-retriable
  // status) or throws (last attempt) on its final iteration, so this is only a
  // type-narrowing guarantee that the function never falls through to undefined.
  /* istanbul ignore next -- unreachable defensive fallback */
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Best-effort cleanup before retrying.
  }
}

async function waitBeforeRetry(attempt: number): Promise<void> {
  const delayMs = FETCH_RETRY_BASE_DELAY_MS * attempt;
  if (delayMs <= 0) return;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}
