/**
 * Writes Google Workspace CLI (gws) credential files to disk.
 *
 * When the container starts with GOOGLE_CLIENT_SECRET_JSON and
 * GOOGLE_CREDENTIALS_JSON env vars, this module writes them to
 * ~/.config/gws/ so the gws CLI picks them up automatically.
 */
import fs from 'node:fs';
import path from 'node:path';

const GWS_CONFIG_DIR = path.join(process.env.HOME ?? '/root', '.config', 'gws');
const CLIENT_SECRET_FILE = 'client_secret.json';
const CREDENTIALS_FILE = 'credentials.json';

export type GwsCredentialsDeps = {
  mkdirSync: (dir: string, opts: { recursive: boolean }) => void;
  writeFileSync: (path: string, data: string, opts: { mode: number }) => void;
  unlinkSync: (path: string) => void;
};

const defaultDeps: GwsCredentialsDeps = {
  mkdirSync: (dir, opts) => fs.mkdirSync(dir, opts),
  writeFileSync: (p, data, opts) => fs.writeFileSync(p, data, opts),
  unlinkSync: p => fs.unlinkSync(p),
};

/**
 * Write gws credential files if the corresponding env vars are set.
 * Returns true if credentials were written, false if skipped.
 */
export function writeGwsCredentials(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
  configDir = GWS_CONFIG_DIR,
  deps: GwsCredentialsDeps = defaultDeps
): boolean {
  const clientSecret = env.GOOGLE_CLIENT_SECRET_JSON;
  const credentials = env.GOOGLE_CREDENTIALS_JSON;

  if (!clientSecret || !credentials) {
    // Clean up stale credential files from a previous run (e.g. after disconnect)
    for (const file of [CLIENT_SECRET_FILE, CREDENTIALS_FILE]) {
      const filePath = path.join(configDir, file);
      try {
        deps.unlinkSync(filePath);
        console.log(`[gws] Removed stale ${filePath}`);
      } catch {
        // File doesn't exist — nothing to clean up
      }
    }
    return false;
  }

  deps.mkdirSync(configDir, { recursive: true });
  deps.writeFileSync(path.join(configDir, CLIENT_SECRET_FILE), clientSecret, { mode: 0o600 });
  deps.writeFileSync(path.join(configDir, CREDENTIALS_FILE), credentials, { mode: 0o600 });

  console.log(`[gws] Wrote credentials to ${configDir}`);
  return true;
}
