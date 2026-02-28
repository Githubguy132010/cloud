// Cloudflare Workers extends SubtleCrypto with timingSafeEqual.
// This augmentation is needed because the standard WebWorker lib doesn't include it.
declare global {
  interface SubtleCrypto {
    timingSafeEqual(a: ArrayBufferView | ArrayBuffer, b: ArrayBufferView | ArrayBuffer): boolean;
  }
}

/**
 * Timing-safe string comparison using crypto.subtle.timingSafeEqual.
 * Works in both Cloudflare Workers and Node.js 16+.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  if (aBytes.length !== bBytes.length) {
    // Compare a against itself so the timing is constant regardless of length mismatch
    crypto.subtle.timingSafeEqual(aBytes, aBytes);
    return false;
  }
  return crypto.subtle.timingSafeEqual(aBytes, bBytes);
}
