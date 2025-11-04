// src/utils/retry.ts
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  attempts = 3,
  initialDelayMs = 500,
  factor = 2,
  shouldRetry?: (err: any) => boolean
): Promise<T> {
  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const retryable = typeof shouldRetry === 'function'
        ? shouldRetry(err)
        : isNetworkError(err);

      if (!retryable || attempt >= attempts) throw err;

      // exponential backoff + jitter
      const jitter = Math.floor(Math.random() * Math.min(200, delay));
      await new Promise((r) => setTimeout(r, delay + jitter));
      delay *= factor;
    }
  }

  function isNetworkError(e: any) {
    if (!e) return false;
    const code = e.code || (e?.errno ? e.errno : undefined);
    // common node network errors
    return ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNREFUSED'].includes(String(code));
  }
}
