/**
 * Collects product telemetry from the live openclaw config.
 *
 * Read from disk once per invocation (~every 24h). All fields have safe
 * defaults so callers never see an exception.
 */
import fs from 'node:fs';

const CONFIG_PATH = '/root/.openclaw/openclaw.json';

export type ProductTelemetry = {
  openclawVersion: string | null;
  defaultModel: string | null;
  channelCount: number;
  enabledChannels: string[];
  toolsProfile: string | null;
  execSecurity: string | null;
  browserEnabled: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function detectChannels(config: unknown): string[] {
  if (!isRecord(config)) return [];
  const ch = isRecord(config.channels) ? config.channels : {};
  const tg = isRecord(ch.telegram) ? ch.telegram : {};
  const dc = isRecord(ch.discord) ? ch.discord : {};
  const sl = isRecord(ch.slack) ? ch.slack : {};
  const channels: string[] = [];
  if (tg.enabled && tg.botToken) channels.push('telegram');
  if (dc.enabled && dc.token) channels.push('discord');
  if (sl.enabled && (sl.botToken || sl.appToken)) channels.push('slack');
  return channels;
}

function getString(obj: unknown, ...path: string[]): string | null {
  let current: unknown = obj;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return typeof current === 'string' ? current : null;
}

function getBoolean(obj: unknown, fallback: boolean, ...path: string[]): boolean {
  let current: unknown = obj;
  for (const key of path) {
    if (!isRecord(current)) return fallback;
    current = current[key];
  }
  return typeof current === 'boolean' ? current : fallback;
}

export type ProductTelemetryDeps = {
  readConfigFile: () => string;
};

const defaultDeps: ProductTelemetryDeps = {
  readConfigFile: () => fs.readFileSync(CONFIG_PATH, 'utf8'),
};

export function collectProductTelemetry(
  openclawVersion: string | null,
  deps: ProductTelemetryDeps = defaultDeps
): ProductTelemetry {
  const empty: ProductTelemetry = {
    openclawVersion,
    defaultModel: null,
    channelCount: 0,
    enabledChannels: [],
    toolsProfile: null,
    execSecurity: null,
    browserEnabled: false,
  };

  let config: unknown;
  try {
    config = JSON.parse(deps.readConfigFile());
  } catch {
    return empty;
  }

  if (!isRecord(config)) return empty;

  const enabledChannels = detectChannels(config);

  return {
    openclawVersion,
    defaultModel: getString(config, 'agents', 'defaults', 'model', 'primary'),
    channelCount: enabledChannels.length,
    enabledChannels,
    toolsProfile: getString(config, 'tools', 'profile'),
    execSecurity: getString(config, 'tools', 'exec', 'security'),
    browserEnabled: getBoolean(config, false, 'browser', 'enabled'),
  };
}
