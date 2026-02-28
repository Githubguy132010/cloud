import type { ErrorHandler } from 'hono';

/**
 * Create a Hono `app.onError` handler that logs the error and returns a 500 JSON response.
 */
export function createErrorHandler(
  logger: { error: (...args: unknown[]) => void } = console
): ErrorHandler {
  return (err, c) => {
    logger.error('Unhandled error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return c.json({ error: 'Internal server error' }, 500);
  };
}
