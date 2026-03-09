import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { writeGwsCredentials, type GwsCredentialsDeps } from './gws-credentials';

function mockDeps() {
  return {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  } satisfies GwsCredentialsDeps;
}

describe('writeGwsCredentials', () => {
  it('writes credential files when both env vars are set', () => {
    const deps = mockDeps();
    const dir = '/tmp/gws-test';
    const result = writeGwsCredentials(
      {
        GOOGLE_CLIENT_SECRET_JSON: '{"client_id":"test"}',
        GOOGLE_CREDENTIALS_JSON: '{"refresh_token":"rt"}',
      },
      dir,
      deps
    );

    expect(result).toBe(true);
    expect(deps.mkdirSync).toHaveBeenCalledWith(dir, { recursive: true });
    expect(deps.writeFileSync).toHaveBeenCalledWith(
      path.join(dir, 'client_secret.json'),
      '{"client_id":"test"}',
      { mode: 0o600 }
    );
    expect(deps.writeFileSync).toHaveBeenCalledWith(
      path.join(dir, 'credentials.json'),
      '{"refresh_token":"rt"}',
      { mode: 0o600 }
    );
  });

  it('skips when GOOGLE_CLIENT_SECRET_JSON is missing', () => {
    const deps = mockDeps();
    const result = writeGwsCredentials(
      { GOOGLE_CREDENTIALS_JSON: '{"refresh_token":"rt"}' },
      '/tmp/gws-test',
      deps
    );

    expect(result).toBe(false);
    expect(deps.mkdirSync).not.toHaveBeenCalled();
    expect(deps.writeFileSync).not.toHaveBeenCalled();
  });

  it('skips when GOOGLE_CREDENTIALS_JSON is missing', () => {
    const deps = mockDeps();
    const result = writeGwsCredentials(
      { GOOGLE_CLIENT_SECRET_JSON: '{"client_id":"test"}' },
      '/tmp/gws-test',
      deps
    );

    expect(result).toBe(false);
    expect(deps.mkdirSync).not.toHaveBeenCalled();
  });

  it('skips when both env vars are missing', () => {
    const deps = mockDeps();
    const result = writeGwsCredentials({}, '/tmp/gws-test', deps);

    expect(result).toBe(false);
  });
});
