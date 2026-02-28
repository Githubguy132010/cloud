declare const scheduler: undefined | { wait: (ms: number) => Promise<void> };

export type DORetryConfig = {
  maxAttempts: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
};

export const DEFAULT_DO_RETRY_CONFIG: DORetryConfig = {
  maxAttempts: 3,
  baseBackoffMs: 100,
  maxBackoffMs: 5000,
};

type RetryableError = Error & { retryable?: boolean };

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (error as RetryableError).retryable === true;
}

function calculateBackoff(attempt: number, config: DORetryConfig): number {
  const exponentialBackoff = config.baseBackoffMs * Math.pow(2, attempt);
  const jitteredBackoff = exponentialBackoff * Math.random();
  return Math.min(config.maxBackoffMs, jitteredBackoff);
}

function waitMs(ms: number): Promise<void> {
  if (typeof scheduler !== 'undefined' && scheduler?.wait) {
    return scheduler.wait(ms);
  }
  return new Promise(resolve => setTimeout(resolve, ms));
}

type DORetryLogger = {
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

/**
 * Execute a Durable Object operation with retry logic.
 *
 * Creates a fresh stub for each retry attempt as recommended by Cloudflare,
 * since certain errors can break the stub.
 */
export async function withDORetry<TStub, TResult>(
  getStub: () => TStub,
  operation: (stub: TStub) => Promise<TResult>,
  operationName: string,
  config: DORetryConfig = DEFAULT_DO_RETRY_CONFIG,
  logger: DORetryLogger = console
): Promise<TResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      const stub = getStub();
      return await operation(stub);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryableError(error)) {
        logger.warn('[do-retry] Non-retryable error', {
          operation: operationName,
          attempt: attempt + 1,
          error: lastError.message,
        });
        throw lastError;
      }

      if (attempt + 1 >= config.maxAttempts) {
        logger.error('[do-retry] All retry attempts exhausted', {
          operation: operationName,
          attempts: attempt + 1,
          error: lastError.message,
        });
        throw lastError;
      }

      const backoffMs = calculateBackoff(attempt, config);
      logger.warn('[do-retry] Retrying', {
        operation: operationName,
        attempt: attempt + 1,
        backoffMs: Math.round(backoffMs),
        error: lastError.message,
      });

      await waitMs(backoffMs);
    }
  }

  throw lastError ?? new Error('Unexpected retry loop exit');
}
