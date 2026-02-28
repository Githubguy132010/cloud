/**
 * Extract the token from an `Authorization: Bearer <token>` header value.
 * Returns `null` if the header is missing or doesn't start with "Bearer ".
 */
export function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}
