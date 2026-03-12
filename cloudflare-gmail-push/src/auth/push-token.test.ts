import { describe, it, expect } from 'vitest';
import { generatePushToken, verifyPushToken } from './push-token';

describe('push-token', () => {
  const secret = 'test-secret-key';
  const userId = 'user_abc123';

  it('generates a 32-char hex token', async () => {
    const token = await generatePushToken(userId, secret);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('generates deterministic tokens', async () => {
    const a = await generatePushToken(userId, secret);
    const b = await generatePushToken(userId, secret);
    expect(a).toBe(b);
  });

  it('generates different tokens for different userIds', async () => {
    const a = await generatePushToken('user1', secret);
    const b = await generatePushToken('user2', secret);
    expect(a).not.toBe(b);
  });

  it('generates different tokens for different secrets', async () => {
    const a = await generatePushToken(userId, 'secret-a');
    const b = await generatePushToken(userId, 'secret-b');
    expect(a).not.toBe(b);
  });

  it('verifies a valid token', async () => {
    const token = await generatePushToken(userId, secret);
    expect(await verifyPushToken(token, userId, secret)).toBe(true);
  });

  it('rejects an invalid token', async () => {
    expect(await verifyPushToken('deadbeef'.repeat(4), userId, secret)).toBe(false);
  });

  it('rejects a wrong-length token', async () => {
    expect(await verifyPushToken('abc', userId, secret)).toBe(false);
  });
});
