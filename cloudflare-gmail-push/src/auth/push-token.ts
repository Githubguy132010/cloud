/**
 * HMAC-SHA256 based push URL token.
 *
 * Each push subscription URL embeds a token derived from
 * HMAC(INTERNAL_API_SECRET, userId), preventing unauthenticated
 * callers from triggering pushes for arbitrary user IDs.
 */

const TOKEN_LENGTH = 32; // hex chars (128 bits)

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Generate push token for a userId. Used by setup script. */
export async function generatePushToken(userId: string, secret: string): Promise<string> {
  const hex = await hmacSha256Hex(userId, secret);
  return hex.slice(0, TOKEN_LENGTH);
}

/** Verify a push token from the URL against the expected HMAC. */
export async function verifyPushToken(
  token: string,
  userId: string,
  secret: string
): Promise<boolean> {
  const expected = await generatePushToken(userId, secret);
  // Constant-length comparison (both are fixed TOKEN_LENGTH hex strings)
  if (token.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
