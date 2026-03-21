/**
 * Retry utilities with exponential back-off and full jitter.
 * Reference: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 */

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3. */
  maxAttempts: number;
  /** Initial delay in ms. Default: 1000. */
  initialDelayMs: number;
  /** Maximum delay cap in ms. Default: 30_000. */
  maxDelayMs: number;
  /** Multiplier applied each retry. Default: 2. */
  backoffMultiplier: number;
  /** Extra random jitter range in ms added to delay. Default: 500. */
  jitterMs: number;
  /**
   * Predicate determining whether to retry on a given error.
   * Default: retry on all errors except 4xx (non-429) HTTP errors.
   */
  retryOn?: (error: unknown) => boolean;
  /** Called before each retry with attempt number, error, and upcoming delay. */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
  jitterMs: 500,
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compute the next delay using full jitter: random in [0, min(cap, base * 2^attempt)].
 */
function computeDelay(attempt: number, opts: RetryOptions): number {
  const exponential = opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt);
  const cap = Math.min(opts.maxDelayMs, exponential);
  const jitter = Math.random() * opts.jitterMs;
  return Math.floor(Math.random() * cap + jitter);
}

/**
 * Default retry predicate: retry on network errors and 5xx; do NOT retry on 4xx (except 429).
 */
function defaultRetryOn(error: unknown): boolean {
  // HTTP-style errors with a status property
  if (
    error !== null &&
    typeof error === 'object' &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  ) {
    const status = (error as { status: number }).status;
    if (status === 429) return true;       // rate limited → retry
    if (status >= 400 && status < 500) return false; // client error → don't retry
    if (status >= 500) return true;        // server error → retry
  }
  return true; // network error → retry
}

/**
 * Execute `fn` up to `options.maxAttempts` times, retrying on failure.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const retryOn = opts.retryOn ?? defaultRetryOn;
  let lastError: unknown;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const isLastAttempt = attempt === opts.maxAttempts - 1;
      const shouldRetry = retryOn(err);

      if (isLastAttempt || !shouldRetry) {
        throw err;
      }

      const delayMs = computeDelay(attempt, opts);
      opts.onRetry?.(attempt + 1, err, delayMs);
      await sleep(delayMs);
    }
  }

  // Unreachable, but TypeScript needs it
  throw lastError;
}

/**
 * Wrap a promise with a timeout. Rejects with a TimeoutError after `timeoutMs`.
 */
export async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
